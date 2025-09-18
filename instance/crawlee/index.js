/* eslint-disable no-console */
// ──────────────────────────────────────────────────────────────────────────────
// HoldInstance: публичный класс-«лаунчер», который открывает страницу и держит её
// Профили Chromium сохраняются в ./session/<profileName>
// ──────────────────────────────────────────────────────────────────────────────

import { PuppeteerCrawler } from "crawlee";
import fs from "node:fs/promises";
import path from "node:path";

import { BIG_TIMEOUT_SECS, DEFAULTS } from "./core/consts.js";
import { setupPlugins } from "./core/plugins.js";
import { FP_INJECTOR, loadOrCreateFingerprint } from "./core/fingerprint.js";
import { spoofLocale, patchWebGLStrict, hardenWebRTC } from "./core/stealth.js";

// ──────────────────────────────────────────────────────────────────────────────
// Утилиты: гарантируем наличие ./session и формируем путь профиля
// ──────────────────────────────────────────────────────────────────────────────
async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {}
}

/** Возвращает абсолютный путь к профилю внутри ./session */
function makeProfilePath(profileName = "default") {
  const dir = path.resolve(process.cwd(), "session", profileName);
  return dir;
}

export class HoldInstance {
  #crawler = null;
  #opts;

  constructor(opts = {}) {
    const profileName = opts.profileName || "default";
    const userDataDir = opts.userDataDir || makeProfilePath(profileName); // ← всегда ./session/<name>

    this.#opts = {
      headless: opts.headless ?? DEFAULTS.headless,
      width: opts.width ?? DEFAULTS.width,
      height: opts.height ?? DEFAULTS.height,
      userDataDir,
      profileName,
      locale: opts.locale ?? DEFAULTS.locale,
      args: opts.args ?? [],

      // стелс/сеть
      stealth: opts.stealth ?? DEFAULTS.stealth,
      userAgent: opts.userAgent ?? DEFAULTS.userAgent,

      timezone: opts.timezone ?? DEFAULTS.timezone,
      geolocation: opts.geolocation ?? DEFAULTS.geolocation,
      proxy: opts.proxy ?? DEFAULTS.proxy,

      webglVendor: opts.webglVendor ?? DEFAULTS.webglVendor,
      webglRenderer: opts.webglRenderer ?? DEFAULTS.webglRenderer,

      disableServiceWorker:
        opts.disableServiceWorker ?? DEFAULTS.disableServiceWorker,
    };
  }

  static async create(opts = {}) {
    return new HoldInstance(opts);
  }

  async open(url, onReady) {
    if (this.#crawler) await this.stop().catch(() => {});

    const {
      width,
      height,
      args,
      headless,
      userDataDir,
      locale,
      stealth,
      userAgent,
      timezone,
      geolocation,
      proxy,
      webglVendor,
      webglRenderer,
      disableServiceWorker,
    } = this.#opts;

    // гарантируем наличие ./session/<profile>
    await ensureDir(userDataDir);

    // подключаем puppeteer-extra плагины
    const puppeteer = setupPlugins({ locale });

    const launchArgs = [
      `--window-size=${width},${height}`,
      `--lang=${locale}`,
      "--disable-blink-features=AutomationControlled",
      "--no-default-browser-check",
      "--no-first-run",
      "--disable-dev-shm-usage",
      "--disable-popup-blocking",
      "--disable-background-timer-throttling",
      "--disable-background-networking",
      "--metrics-recording-only",
      "--password-store=basic",
      "--use-mock-keychain",
      ...(disableServiceWorker ? ["--disable-features=ServiceWorker"] : []),
      ...(proxy ? [`--proxy-server=${proxy}`] : []),
      ...args,
    ];

    // стабильный отпечаток (кэшируется в userDataDir/fingerprint.json)
    const fingerprint = await loadOrCreateFingerprint(userDataDir, {
      locale: (locale.split(",")[0] || "ru-RU").trim(),
    });

    // ── Конфиг для новых и старых Crawlee:
    // В новых версиях можно передать launcher (puppeteer-extra) через launchContext.launcher.
    // В старых версиях это поле не поддерживается — тогда просто не передаем его.
    const launchContext = {
      launchOptions: {
        headless,
        args: launchArgs,
        defaultViewport: { width, height },
      },
      ...(userDataDir ? { userDataDir } : {}),
    };

    // Попробуем добавить launcher. Если у тебя старая версия Crawlee — убери эту строку.
    // Оставляю как дефолт: сначала с launcher, а ниже есть «fallback» на случай ошибки.
    let crawlerOptions = {
      keepAlive: true,

      // без ретраев и автопараллельности
      maxConcurrency: 1,
      maxRequestsPerCrawl: 1,
      maxRequestRetries: 0,

      // огромные таймауты (держим вкладку «вечно»)
      requestHandlerTimeoutSecs: BIG_TIMEOUT_SECS,
      navigationTimeoutSecs: BIG_TIMEOUT_SECS,

      launchContext: { ...launchContext, launcher: puppeteer },

      preNavigationHooks: [
        async ({ page }, gotoOptions) => {
          page.setDefaultTimeout(0);
          page.setDefaultNavigationTimeout(0);

          if (userAgent) await page.setUserAgent(userAgent);

          if (stealth) {
            await FP_INJECTOR.attachFingerprintToPuppeteer(page, fingerprint, {
              webglVendor,
              webglRenderer,
            });
            await spoofLocale(page, locale);
            await patchWebGLStrict(page, webglVendor, webglRenderer);
            await hardenWebRTC(page);
          }

          if (timezone) {
            try {
              await page.emulateTimezone(timezone);
            } catch {}
          }

          if (geolocation) {
            try {
              const cdp = await page.target().createCDPSession();
              const origin = new URL(url).origin;
              await cdp.send("Browser.grantPermissions", {
                origin,
                permissions: ["geolocation"],
              });
              await page.setGeolocation(geolocation);
            } catch {}
          }

          gotoOptions.waitUntil = "domcontentloaded";
          gotoOptions.timeout = 0;
        },
      ],

      requestHandler: async ({ page, request, log }) => {
        log.info(`Открыл: ${request.url}`);
        try {
          await page.waitForSelector("title", { timeout: 0 }).catch(() => {});
          log.info(`Заголовок: ${await page.title()}`);
        } catch {}

        if (typeof onReady === "function") {
          try {
            await onReady({ page });
          } catch (e) {
            log.exception?.(e, "Ошибка в onReady()") || console.error(e);
          }
        }

        // держим «вечно», пока не вызовешь stop()
        await new Promise(() => {});
      },

      failedRequestHandler: ({ request, log }) => {
        log.error(`Не удалось обработать: ${request.url}`);
      },
    };

    // Если словим ошибку «Did not expect property `launcher` to exist» — перезапустим без него
    try {
      this.#crawler = new PuppeteerCrawler(crawlerOptions);
    } catch (e) {
      if (
        String(e?.message || "").includes("Did not expect property `launcher`")
      ) {
        // старый Crawlee — убираем launcher
        this.#crawler = new PuppeteerCrawler({
          ...crawlerOptions,
          launchContext: { ...launchContext }, // без launcher
        });
      } else {
        throw e;
      }
    }

    await this.#crawler.run([url]);
  }

  async stop() {
    if (!this.#crawler) return;
    const c = this.#crawler;

    try {
      await c.autoscaledPool?.abort?.();
    } catch {}
    try {
      await c.browserPool?.retireAll?.();
      await c.browserPool?.close?.();
    } catch {}
    try {
      if (typeof c.teardown === "function") {
        await c.teardown();
      } else {
        c?.[Symbol.for("teardown")]?.();
      }
    } catch {}

    this.#crawler = null;
  }
}
