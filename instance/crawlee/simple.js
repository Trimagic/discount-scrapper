/* eslint-disable no-console */
import { PuppeteerCrawler, Configuration } from "crawlee";
import fs from "node:fs/promises";
import path from "node:path";

Configuration.set("systemInfoV2", true);
Configuration.set("disableSystemInfo", true);

export class HoldInstance {
  constructor(opts = {}) {
    this.width = opts.width ?? 1920;
    this.height = opts.height ?? 900;
    this.headless = opts.headless ?? false;

    // поведение:
    this.holdAfterRun = opts.holdAfterRun ?? true; // ← держать окно ПОСЛЕ всего прогона
    this.waitOnError = opts.waitOnError ?? true; // держать окно при ошибке

    // навигация/тайминги:
    this.navigationTimeoutSecs = opts.navigationTimeoutSecs ?? 60;

    // сессии:
    this.sessionBaseDir = opts.sessionBaseDir ?? "./session";
    this.profileName = opts.profileName ?? undefined;
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
   * Один URL.
   * @param {string} url
   * @param {(ctx: { page: import('puppeteer').Page, request: any, log: any, stableEval: <T>(fn: (...args:any[]) => T, ...args:any[])=>Promise<T> }) => Promise<void>} handler
   * @param {{ holdAfterRun?: boolean }} [opts]
   */
  async open(url, handler, opts = {}) {
    return this.#runInternal([url], handler, {
      maxRequestsPerCrawl: 1,
      holdAfterRun: opts.holdAfterRun ?? this.holdAfterRun,
    });
  }

  /**
   * Несколько URL-ов за один прогон.
   * @param {string[]} urls
   * @param {(ctx: { page: import('puppeteer').Page, request: any, log: any, stableEval: <T>(fn: (...args:any[]) => T, ...args:any[])=>Promise<T> }) => Promise<void>} handler
   * @param {{ holdAfterRun?: boolean, maxRequestsPerCrawl?: number }} [opts]
   */
  async openMany(urls, handler, opts = {}) {
    const m = Number.isFinite(opts.maxRequestsPerCrawl)
      ? opts.maxRequestsPerCrawl
      : urls.length || 1;
    return this.#runInternal(urls, handler, {
      maxRequestsPerCrawl: m,
      holdAfterRun: opts.holdAfterRun ?? this.holdAfterRun,
    });
  }

  async #runInternal(urls, handler, runOpts) {
    const self = this;

    const crawler = new PuppeteerCrawler({
      headless: self.headless,
      maxRequestsPerCrawl: runOpts.maxRequestsPerCrawl ?? Infinity,

      maxRequestRetries: 0,
      navigationTimeoutSecs: self.navigationTimeoutSecs,
      requestHandlerTimeoutSecs: Math.max(self.navigationTimeoutSecs + 30, 90),

      browserPoolOptions: {
        retireBrowserAfterPageCount: Number.MAX_SAFE_INTEGER,
        maxOpenPagesPerBrowser: 1,
      },

      launchContext: {
        userDataDir: self.sessionDir,
        launchOptions: {
          defaultViewport: { width: self.width, height: self.height },
        },
      },

      preNavigationHooks: [
        async (_ctx, gotoOptions) => {
          gotoOptions.waitUntil = "networkidle2";
          gotoOptions.timeout = self.navigationTimeoutSecs * 1000;
        },
      ],

      async requestHandler(ctx) {
        const { page, log } = ctx;

        try {
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
            await handler({ ...ctx, stableEval });
          }

          // ВАЖНО: не ставим здесь "вечную паузу", иначе run() не завершится!
        } catch (err) {
          console.error("❌ Handler error:", err?.message || err);
          if (self.waitOnError) {
            console.log(
              "⏸️ waitOnError=true → удерживаю окно после ошибки. Нажми Ctrl+C чтобы выйти."
            );
            await new Promise(() => {}); // держим только при ошибке по желанию
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

    await crawler.run(urls);

    // Держим окно ПОСЛЕ полного прогона (если нужно)
    if (runOpts.holdAfterRun) {
      console.log(
        "⏸️ holdAfterRun=true → удерживаю окно после завершения прогона. Нажми Ctrl+C чтобы выйти."
      );
      await new Promise(() => {});
    }
  }

  async stop() {
    console.log(
      "ℹ️ stop(): Crawlee закроет браузер после завершения run(). Для принудительного выхода — Ctrl+C."
    );
  }
}

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
