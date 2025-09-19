/* eslint-disable no-console */
// HoldInstance на Crawlee + PuppeteerCrawler + персистентная сессия
// - сохраняет/читает профиль браузера из userDataDir
// - sessionDir вычисляется из sessionBaseDir + profileName, либо можно передать напрямую
// - держит окно открытым при успехе/ошибке
// - без ретраев

import { PuppeteerCrawler, Configuration } from "crawlee";
import fs from "node:fs/promises";
import path from "node:path";

Configuration.set("systemInfoV2", true);

export class HoldInstance {
  constructor(opts = {}) {
    this.width = opts.width ?? 1920;
    this.height = opts.height ?? 900;
    this.headless = opts.headless ?? false;

    // поведение:
    this.keepOpenOnSuccess = opts.keepOpenOnSuccess ?? true; // держать окно при успехе
    this.waitOnError = opts.waitOnError ?? true; // держать окно при ошибке

    // навигация/тайминги:
    this.navigationTimeoutSecs = opts.navigationTimeoutSecs ?? 60;

    // сессии:
    this.sessionBaseDir = opts.sessionBaseDir ?? "./session";
    this.profileName = opts.profileName ?? undefined;
    // если явно передали sessionDir — он перекрывает вычисление
    this.sessionDir = opts.sessionDir ?? undefined;
  }

  static async create(opts = {}) {
    const inst = new HoldInstance(opts);
    await inst.#ensureSessionDir();
    return inst;
  }

  async #ensureSessionDir() {
    if (!this.sessionDir) {
      const name = this.profileName || "default";
      this.sessionDir = path.resolve(this.sessionBaseDir, name);
    } else {
      this.sessionDir = path.resolve(this.sessionDir);
    }
    await fs.mkdir(this.sessionDir, { recursive: true });
    console.log(`📁 userDataDir: ${this.sessionDir}`);
  }

  /**
   * @param {string} url
   * @param {(ctx: { page: import('puppeteer').Page, request: any, log: any, stableEval: <T>(fn: (...args:any[]) => T, ...args:any[])=>Promise<T> }) => Promise<void>} handler
   */
  async open(url, handler) {
    const self = this; // фиксируем контекст

    const crawler = new PuppeteerCrawler({
      headless: self.headless,
      maxRequestsPerCrawl: 1,
      maxRequestRetries: 0, // без ретраев
      navigationTimeoutSecs: self.navigationTimeoutSecs,
      requestHandlerTimeoutSecs: Math.max(self.navigationTimeoutSecs + 30, 90),

      browserPoolOptions: {
        retireBrowserAfterPageCount: Number.MAX_SAFE_INTEGER,
        maxOpenPagesPerBrowser: 1,
      },

      launchContext: {
        // ВАЖНО: сохраняем/читаем профиль браузера тут
        userDataDir: self.sessionDir,
        launchOptions: {
          defaultViewport: { width: self.width, height: self.height },
        },
      },

      // Настраиваем goto через preNavigationHooks (аналог gotoFunction в новых версиях)
      preNavigationHooks: [
        async (_ctx, gotoOptions) => {
          gotoOptions.waitUntil = "networkidle2";
          gotoOptions.timeout = self.navigationTimeoutSecs * 1000;
        },
      ],

      async requestHandler(ctx) {
        const { page, request, log } = ctx;

        try {
          // базовая стабилизация перед evaluate/$eval
          await page.waitForSelector("body", { timeout: 30_000 });
          await page.waitForFunction(
            () => ["interactive", "complete"].includes(document.readyState),
            { timeout: 30_000 }
          );
          try {
            if (page.waitForNetworkIdle) {
              await page.waitForNetworkIdle({ idleTime: 800, timeout: 10_000 });
            }
          } catch {}

          const stableEval = createStableEval(page);

          if (typeof handler === "function") {
            await handler({ page, request, log, stableEval });
          }

          if (self.keepOpenOnSuccess) {
            console.log(
              "⏸️ keepOpenOnSuccess=true → удерживаю окно. Нажми Ctrl+C чтобы выйти."
            );
            await new Promise(() => {}); // держим при успехе
          }
        } catch (err) {
          console.error("❌ Handler error:", err?.message || err);
          if (self.waitOnError) {
            console.log(
              "⏸️ waitOnError=true → удерживаю окно после ошибки. Нажми Ctrl+C чтобы выйти."
            );
            await new Promise(() => {}); // держим при ошибке
          } else {
            throw err;
          }
        }
      },

      async failedRequestHandler({ request, error }) {
        console.error(
          "❌ failedRequestHandler:",
          request.url,
          "-",
          error?.message || error
        );
        if (self.waitOnError) {
          console.log(
            "⏸️ waitOnError=true → удерживаю окно после навигационной ошибки. Нажми Ctrl+C чтобы выйти."
          );
          await new Promise(() => {});
        }
      },
    });

    await crawler.run([url]); // не вернётся, пока «вечная пауза» активна
  }

  async stop() {
    console.log(
      "ℹ️ stop(): Crawlee закроет браузер после завершения run(). Для принудительного выхода — Ctrl+C."
    );
  }
}

/**
 * Обёртка для page.evaluate:
 * При "Execution context was destroyed" ждём DOM и пробуем ещё раз (1 раз).
 */
function createStableEval(page) {
  return async (fn, ...args) => {
    try {
      return await page.evaluate(fn, ...args);
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes("Execution context was destroyed")) {
        await page.waitForSelector("body", { timeout: 30_000 });
        await page.waitForFunction(
          () => ["interactive", "complete"].includes(document.readyState),
          { timeout: 30_000 }
        );
        return await page.evaluate(fn, ...args);
      }
      throw e;
    }
  };
}
