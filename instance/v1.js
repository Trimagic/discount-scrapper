/* eslint-disable no-console */
// ───────────────────────────────────────────────────────────────────────────────
// Stealth Puppeteer instance with fingerprinting, proxy, retries & helpers
// ───────────────────────────────────────────────────────────────────────────────

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import UserPrefsPlugin from "puppeteer-extra-plugin-user-preferences";
import path from "node:path";
import fs from "node:fs/promises";
import { FingerprintGenerator } from "fingerprint-generator";
import { FingerprintInjector } from "fingerprint-injector";

puppeteer.use(StealthPlugin());
puppeteer.use(UserPrefsPlugin());

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────
function normalizeHeadless(value) {
  if (value === undefined || value === null) return "new";
  const v = String(value).toLowerCase();
  if (v === "false") return false;
  if (v === "true") return true;
  if (v === "new") return "new";
  return "new";
}

function parseProxy(proxyStr) {
  if (!proxyStr) return null;
  try {
    const u = new URL(proxyStr);
    const auth = u.username
      ? {
          username: decodeURIComponent(u.username),
          password: decodeURIComponent(u.password || ""),
        }
      : null;
    return { server: `${u.protocol}//${u.hostname}:${u.port}`, auth };
  } catch {
    return null;
  }
}

async function ensureDir(dir) {
  if (!dir) return;
  await fs.mkdir(dir, { recursive: true }).catch(() => {});
}

function timeout(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Всегда кладём профиль внутрь ./session в корне проекта */
function resolveProfileDir(requested) {
  const rootSession = path.join(process.cwd(), "session");
  const name =
    requested && requested.trim().length ? path.basename(requested) : "default";
  return path.join(rootSession, name);
}

// ───────────────────────────────────────────────────────────────────────────────
// StealthBrowser
// ───────────────────────────────────────────────────────────────────────────────
export class StealthBrowser {
  /**
   * @param {Object} opts
   * @param {string} [opts.userDataDir] - имя профиля (будет сохранён в ./session/<имя>)
   * @param {string|boolean} [opts.headless]
   * @param {string} [opts.proxy]
   * @param {string} [opts.locale]
   * @param {number} [opts.slowMo]
   * @param {number} [opts.defaultTimeout]
   */
  static async launch(opts = {}) {
    const {
      userDataDir, // теперь это имя профиля
      headless = "new",
      proxy = undefined,
      locale = "en-US,en;q=0.9",
      slowMo = 0,
      defaultTimeout = 45000,
    } = opts;

    const profilePath = resolveProfileDir(userDataDir);
    await ensureDir(profilePath);

    const proxyCfg = parseProxy(proxy);
    const launchArgs = [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-blink-features=AutomationControlled",
      `--lang=${(locale || "en-US").split(",")[0]}`,
    ];
    if (proxyCfg?.server) launchArgs.push(`--proxy-server=${proxyCfg.server}`);

    const browser = await puppeteer.launch({
      headless: normalizeHeadless(headless),
      userDataDir: profilePath,
      args: launchArgs,
      slowMo,
      ignoreHTTPSErrors: true,
      defaultViewport: null,
    });

    if (proxyCfg?.auth) {
      browser.__proxyAuth = proxyCfg.auth; // применяем в newPage()
    }

    browser.__locale = locale;
    browser.__defaultTimeout = defaultTimeout;

    return new StealthBrowser(browser);
  }

  constructor(browser) {
    this.browser = browser;
    this.fingerprintGenerator = new FingerprintGenerator({
      browsers: [{ name: "chrome", minVersion: 116 }],
      devices: ["desktop"],
      operatingSystems: ["windows", "linux"],
      locales: [this.browser.__locale || "en-US"],
    });
    this.injector = new FingerprintInjector();
  }

  async close() {
    try {
      await this.browser.close();
    } catch {}
  }

  async newPage(opts = {}) {
    const page = await this.browser.newPage();

    if (this.browser.__proxyAuth) {
      await page.authenticate(this.browser.__proxyAuth).catch(() => {});
    }

    const fp = this.fingerprintGenerator.getFingerprint();
    await this.injector.attachFingerprintToPuppeteer(page, fp);

    const langHeader = this.browser.__locale || "en-US,en;q=0.9";
    await page.setExtraHTTPHeaders({ "Accept-Language": langHeader });

    if (opts.userAgent) {
      await page.setUserAgent(opts.userAgent);
    } else if (fp?.navigator?.userAgent) {
      await page.setUserAgent(fp.navigator.userAgent);
    }

    page.setDefaultTimeout(this.browser.__defaultTimeout || 45000);
    page.setDefaultNavigationTimeout(this.browser.__defaultTimeout || 45000);

    if (opts.blockResources?.length) {
      const blocked = new Set(opts.blockResources);
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const type = req.resourceType();
        if (blocked.has(type)) return req.abort();
        return req.continue();
      });
    }

    if (opts.maxConcurrencySignals === false) {
      await page.evaluateOnNewDocument(() => {
        const _setInterval = window.setInterval;
        const _setTimeout = window.setTimeout;
        window.setInterval = (fn, t, ...a) =>
          _setInterval(fn, Math.max(60, t || 60), ...a);
        window.setTimeout = (fn, t, ...a) =>
          _setTimeout(fn, Math.max(30, t || 30), ...a);
      });
    }

    return page;
  }

  async gotoSafe(page, url, nav = {}) {
    const attempts = 3;
    let err;
    for (let i = 0; i < attempts; i++) {
      try {
        await page.goto(url, {
          waitUntil: nav.waitUntil || "networkidle2",
          timeout: nav.timeout || this.browser.__defaultTimeout || 45000,
        });
        return;
      } catch (e) {
        err = e;
        await timeout(500 + i * 750);
      }
    }
    throw err;
  }

  async waitNetworkIdle(page, idleMs = 1200, maxWait = 15000) {
    let timeoutId;
    let fulfill;
    const pending = new Set();
    const cleanup = () => {
      page.removeListener("request", onReq);
      page.removeListener("requestfinished", onDone);
      page.removeListener("requestfailed", onDone);
      clearTimeout(timeoutId);
    };
    const onReq = (r) => pending.add(r);
    const onDone = (r) => {
      pending.delete(r);
      if (pending.size === 0) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          cleanup();
          fulfill();
        }, idleMs);
      }
    };
    return new Promise((res) => {
      fulfill = res;
      page.on("request", onReq);
      page.on("requestfinished", onDone);
      page.on("requestfailed", onDone);
      timeoutId = setTimeout(() => {
        cleanup();
        res();
      }, maxWait);
    });
  }

  async autoScroll(page, step = 600, delay = 150) {
    await page.evaluate(
      async (s, d) => {
        await new Promise((resolve) => {
          let y = 0;
          const h = document.body.scrollHeight;
          const t = setInterval(() => {
            y += s;
            window.scrollTo(0, y);
            if (y >= h - window.innerHeight - 2) {
              clearInterval(t);
              resolve();
            }
          }, d);
        });
      },
      step,
      delay
    );
  }

  async saveCookies(page, file = ".cookies.json") {
    const cookies = await page.cookies();
    await fs.writeFile(file, JSON.stringify(cookies, null, 2));
  }

  async loadCookies(page, file = ".cookies.json") {
    try {
      const raw = await fs.readFile(file, "utf8");
      const cookies = JSON.parse(raw);
      if (Array.isArray(cookies) && cookies.length) {
        await page.setCookie(...cookies);
      }
    } catch {}
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Quick demo: `node stealth-instance.js URL`
// Всегда пишет профиль в ./session/demo
// ───────────────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    const url = process.argv[2] || "https://bot.sannysoft.com";
    const sb = await StealthBrowser.launch({
      headless: process.env.HEADLESS ?? "new",
      proxy: process.env.PROXY,
      userDataDir: process.env.PROFILE || "demo", // имя профиля → ./session/demo
      locale: process.env.LANGS || "en-US,en;q=0.9,ru;q=0.8",
      defaultTimeout: 60000,
    });
    const page = await sb.newPage({
      blockResources: ["media", "font"],
      maxConcurrencySignals: false,
    });
    await sb.gotoSafe(page, url);
    await sb.waitNetworkIdle(page);
    console.log("Opened:", url);
    await sb.close();
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
