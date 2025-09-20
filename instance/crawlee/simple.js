/* eslint-disable no-console */
import { PuppeteerCrawler, Configuration, RequestQueue } from "crawlee";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

Configuration.set("systemInfoV2", true);
Configuration.set("disableSystemInfo", true);

/**
 * Долго-живущий инстанс:
 * - единый PuppeteerCrawler
 * - единый RequestQueue
 * - enqueue(url) -> Promise<result>, который резолвится из requestHandler
 */
export class HoldInstanceQueue {
  constructor(opts = {}) {
    // вьюпорт/режим
    this.width = opts.width ?? 1920;
    this.height = opts.height ?? 900;
    this.headless = opts.headless ?? false;

    // поведение
    this.waitOnError = opts.waitOnError ?? true;

    // тайминги
    this.navigationTimeoutSecs = opts.navigationTimeoutSecs ?? 60;

    // сессии
    this.sessionBaseDir = opts.sessionBaseDir ?? "./session";
    this.profileName = opts.profileName ?? "default";
    this.sessionDir = opts.sessionDir ?? undefined;

    // общий обработчик (например, твой getFullDataMarket)
    this.extractor =
      typeof opts.extractor === "function" ? opts.extractor : null;

    // ожидания результатов
    /** @type {Map<string, {resolve:Function, reject:Function}>} */
    this._pending = new Map();

    // состояния
    this._queue = null;
    this._crawler = null;
    this._isRunning = false;
    this._runPromise = null;
  }

  static async create(opts = {}) {
    const inst = new HoldInstanceQueue(opts);
    await inst.#ensureSessionDir();
    await inst.#ensureQueue();
    await inst.#ensureCrawler();
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

  async #ensureQueue() {
    if (!this._queue) {
      this._queue = await RequestQueue.open(`rq-${this.profileName}`);
      console.log(`🗂️ RequestQueue ready: rq-${this.profileName}`);
    }
  }

  async #ensureCrawler() {
    if (this._crawler) return;

    const self = this;

    this._crawler = new PuppeteerCrawler({
      headless: self.headless,
      maxRequestRetries: 0,
      navigationTimeoutSecs: self.navigationTimeoutSecs,
      requestHandlerTimeoutSecs: Math.max(self.navigationTimeoutSecs + 30, 90),

      requestQueue: self._queue,

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
        const { page, request } = ctx;
        const key = request.userData?.jobKey;

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

          // пользовательский парсер
          let result = null;
          if (typeof self.extractor === "function") {
            result = await self.extractor(page, request.url, {
              ctx,
              stableEval,
            });
          } else {
            // дефолт
            result = await stableEval(() => {
              const h1 = document.querySelector("h1");
              return {
                title: h1 ? h1.textContent.trim() : null,
                url: location.href,
              };
            });
          }

          const waiter = key ? self._pending.get(key) : null;
          if (waiter) {
            waiter.resolve({ ok: true, url: request.url, result });
            self._pending.delete(key);
          }
        } catch (err) {
          console.error("❌ Handler error:", err?.message || err);
          const waiter = key ? self._pending.get(key) : null;

          if (waiter) {
            waiter.reject(err);
            self._pending.delete(key);
          }

          if (self.waitOnError) {
            console.log(
              "⏸️ waitOnError=true → держу окно. Ctrl+C чтобы выйти."
            );
            await new Promise(() => {});
          } else {
            throw err;
          }
        }
      },

      async failedRequestHandler({ request, error }) {
        const key = request.userData?.jobKey;
        console.error(
          "❌ failedRequestHandler:",
          request.url,
          "-",
          error?.message || error
        );
        const waiter = key ? this._pending.get(key) : null;
        if (waiter) {
          waiter.reject(error);
          this._pending.delete(key);
        }
        if (this.waitOnError) {
          console.log(
            "⏸️ waitOnError=true → держу окно после nav-ошибки. Ctrl+C чтобы выйти."
          );
          await new Promise(() => {});
        }
      },
    });
  }

  async #ensureRun() {
    if (this._isRunning) return this._runPromise;

    this._isRunning = true;
    this._runPromise = (async () => {
      try {
        console.log("▶️ crawler.run() started");
        await this._crawler.run(); // завершится, когда очередь опустеет
        console.log("⏹️ crawler.run() finished (queue empty)");
      } finally {
        this._isRunning = false;
      }
    })();

    return this._runPromise;
  }

  /**
   * Поставить URL в очередь и дождаться результата парсинга.
   * @param {string} url
   * @param {{ uniqueKey?: string, userData?: any }} [opts]
   */
  async enqueue(url, { uniqueKey, userData } = {}) {
    if (!url || typeof url !== "string") {
      throw new Error("enqueue(url): нужен валидный URL (string).");
    }

    const jobKey = crypto.randomUUID();
    const promise = new Promise((resolve, reject) => {
      this._pending.set(jobKey, { resolve, reject });
    });

    // Генерим уникальный ключ, если не передан явно
    const effectiveKey = uniqueKey || `${url}::${Date.now()}`;
    const addRes = await this._queue.addRequest(
      {
        url,
        uniqueKey: effectiveKey,
        userData: { ...(userData || {}), jobKey },
      },
      { forefront: true }
    );

    // Если задача уже была/есть — форсируем повтор с новым ключом
    if (addRes?.wasAlreadyHandled || addRes?.wasAlreadyPresent) {
      const forceKey = `${url}::force::${Date.now()}`;
      const addRes2 = await this._queue.addRequest(
        {
          url,
          uniqueKey: forceKey,
          userData: { ...(userData || {}), jobKey },
        },
        { forefront: true }
      );

      if (addRes2?.wasAlreadyHandled) {
        const waiter = this._pending.get(jobKey);
        if (waiter) {
          waiter.reject(
            new Error("Request wasAlreadyHandled; use uniqueKey to re-run.")
          );
          this._pending.delete(jobKey);
        }
        return promise;
      }
    }

    // гарантируем запуск краулера
    this.#ensureRun().catch((e) => {
      console.error("ensureRun() error:", e);
      const waiter = this._pending.get(jobKey);
      if (waiter) {
        waiter.reject(e);
        this._pending.delete(jobKey);
      }
    });

    return promise;
  }

  async stop() {
    console.log("ℹ️ stop(): дождусь завершения текущего run() (если он идёт).");
    try {
      if (this._runPromise) await this._runPromise;
    } catch (e) {
      console.error("stop() run error:", e);
    }
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
