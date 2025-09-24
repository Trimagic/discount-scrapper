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
 * - enqueue(url, { ...userData }) -> Promise<result>, который резолвится из requestHandler
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

    // общий обработчик (например, твой getFullDataMarket/getPricesForUrls)
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
    console.log("[HoldInstanceQueue] create() called");
    const inst = new HoldInstanceQueue(opts);
    await inst.#ensureSessionDir();
    await inst.#ensureQueue();
    await inst.#ensureCrawler();
    console.log("[HoldInstanceQueue] create() ready");
    return inst;
  }

  async #ensureSessionDir() {
    console.log("[HoldInstanceQueue] ensureSessionDir");
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
      console.log("[HoldInstanceQueue] Opening RequestQueue…");
      this._queue = await RequestQueue.open(`rq-${this.profileName}`);
      console.log(`🗂️ RequestQueue ready: rq-${this.profileName}`);
    }
  }

  async #ensureCrawler() {
    if (this._crawler) return;
    console.log("[HoldInstanceQueue] Creating PuppeteerCrawler…");

    const self = this;

    this._crawler = new PuppeteerCrawler({
      headless: self.headless,
      maxRequestRetries: 0,
      navigationTimeoutSecs: self.navigationTimeoutSecs,
      requestHandlerTimeoutSecs: Math.max(self.navigationTimeoutSecs + 30, 180),

      requestQueue: self._queue,

      browserPoolOptions: {
        retireBrowserAfterPageCount: Number.MAX_SAFE_INTEGER,
        maxOpenPagesPerBrowser: 1,
      },

      launchContext: {
        userDataDir: self.sessionDir,
        launchOptions: {
          defaultViewport: { width: self.width, height: self.height },
          headless: self.headless,
        },
      },

      preNavigationHooks: [
        async (_ctx, gotoOptions) => {
          console.log(
            "[preNavigationHooks] set waitUntil=networkidle2, timeout=%dms",
            self.navigationTimeoutSecs * 1000
          );
          gotoOptions.waitUntil = "networkidle2";
          gotoOptions.timeout = self.navigationTimeoutSecs * 1000;
        },
      ],

      async requestHandler(ctx) {
        const { page, request } = ctx;
        const key = request.userData?.jobKey;
        const items = request.userData?.items;
        const mode = request.userData?.mode;

        console.log("[requestHandler] fired →", {
          url: request.url,
          key,
          mode,
          hasItems: Array.isArray(items),
          itemsCount: Array.isArray(items) ? items.length : 0,
        });

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

          // userData, которые придут в extractor
          const userDataForExtractor = {
            ...request.userData,
            ctx,
            stableEval,
          };

          // пользовательский парсер
          let result = null;
          if (typeof self.extractor === "function") {
            console.log("[requestHandler] calling extractor with userData:", {
              ...userDataForExtractor,
              // не спамим лог jobKey в явном виде
              jobKey: userDataForExtractor.jobKey ? "[present]" : undefined,
            });
            result = await self.extractor(
              page,
              request.url,
              userDataForExtractor
            );
          } else {
            console.log(
              "[requestHandler] no extractor provided, using default evaluate()"
            );
            result = await stableEval(() => {
              const h1 = document.querySelector("h1");
              return {
                title: h1 ? h1.textContent.trim() : document.title || null,
                url: location.href,
              };
            });
          }

          // нормализуем результат
          const payload =
            result &&
            typeof result === "object" &&
            ("data" in result || "error" in result)
              ? result
              : { data: result, error: null };

          const waiter = key ? self._pending.get(key) : null;
          if (waiter) {
            console.log("[requestHandler] resolving job:", key);
            waiter.resolve(payload);
            self._pending.delete(key);
          } else {
            console.warn("[requestHandler] no pending resolver for key:", key);
          }
        } catch (err) {
          console.error("[requestHandler] ❌ Error:", err?.message || err);
          const waiter = key ? self._pending.get(key) : null;

          if (waiter) {
            console.log("[requestHandler] rejecting job:", key);
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
        console.error("[failedRequestHandler]", {
          url: request.url,
          key,
          error: error?.message || error,
        });

        const waiter = key ? self._pending.get(key) : null;
        if (waiter) {
          waiter.reject(error);
          self._pending.delete(key);
        }

        if (self.waitOnError) {
          console.log(
            "⏸️ waitOnError=true → держу окно после nav-ошибки. Ctrl+C чтобы выйти."
          );
          await new Promise(() => {});
        }
      },
    });

    console.log("[HoldInstanceQueue] PuppeteerCrawler created");
  }

  async #ensureRun() {
    if (this._isRunning) {
      console.log("[HoldInstanceQueue] run() already active");
      return this._runPromise;
    }

    console.log("[HoldInstanceQueue] starting crawler.run()");
    this._isRunning = true;
    this._runPromise = (async () => {
      try {
        await this._crawler.run(); // завершится, когда очередь опустеет
        console.log("[HoldInstanceQueue] crawler.run() finished (queue empty)");
      } catch (e) {
        console.error("[HoldInstanceQueue] run() error:", e?.message || e);
      } finally {
        this._isRunning = false;
      }
    })();

    return this._runPromise;
  }

  /**
   * Поставить URL в очередь и дождаться результата парсинга.
   * opts может содержать произвольные поля (mode, items, ...), они попадут в request.userData
   * @param {string} url
   * @param {{ uniqueKey?: string, [k:string]: any }} [opts]
   */
  async enqueue(url, opts = {}) {
    console.log("[enqueue] called", { url });
    if (!url || typeof url !== "string") {
      throw new Error("enqueue(url): нужен валидный URL (string).");
    }

    const { uniqueKey, ...rest } = opts; // ← соберём всё (mode, items, etc.) в rest
    const jobKey = crypto.randomUUID();
    const promise = new Promise((resolve, reject) => {
      this._pending.set(jobKey, { resolve, reject });
    });

    const effectiveKey = uniqueKey || `${url}::${Date.now()}`;
    console.log("[enqueue] addRequest", {
      effectiveKey,
      jobKey,
      userData: rest,
    });

    const addRes = await this._queue.addRequest(
      {
        url,
        uniqueKey: effectiveKey,
        userData: { ...rest, jobKey }, // ← теперь mode/items поедут сюда
      },
      { forefront: true }
    );

    if (addRes?.wasAlreadyHandled || addRes?.wasAlreadyPresent) {
      // форсируем повтор с новым ключом
      const forceKey = `${url}::force::${Date.now()}`;
      console.log("[enqueue] duplicate detected → addRequest(force)", {
        forceKey,
        jobKey,
      });

      const addRes2 = await this._queue.addRequest(
        {
          url,
          uniqueKey: forceKey,
          userData: { ...rest, jobKey },
        },
        { forefront: true }
      );

      if (addRes2?.wasAlreadyHandled) {
        console.warn("[enqueue] wasAlreadyHandled on force request");
        const waiter = this._pending.get(jobKey);
        if (waiter) {
          waiter.reject(
            new Error("Request wasAlreadyHandled; provide uniqueKey to re-run.")
          );
          this._pending.delete(jobKey);
        }
        return promise;
      }
    }

    // гарантируем запуск краулера
    this.#ensureRun().catch((e) => {
      console.error("[enqueue] ensureRun error", e);
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

/** Надёжный evaluate: повторяет после «Execution context was destroyed» */
function createStableEval(page) {
  return async (fn, ...args) => {
    try {
      return await page.evaluate(fn, ...args);
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes("Execution context was destroyed")) {
        console.warn(
          "[stableEval] context destroyed → retrying after DOM ready"
        );
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
