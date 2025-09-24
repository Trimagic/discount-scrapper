/* eslint-disable no-console */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";

import { HoldInstanceQueue } from "./instance/crawlee/simple.js";
import { mainParser } from "./services/utils/main-parser.js";

// =========================
// ⚙️ Конфиг через env
// =========================
const HOST = process.env.HOST ?? "0.0.0.0";
const PORT = Number(process.env.PORT ?? 5000);

// Источник и приёмник результатов
const SOURCE_URL =
  process.env.SOURCE_URL ?? "http://localhost:8787/helper/get-markets-url";
const REPORT_URL =
  process.env.REPORT_URL ?? "http://localhost:8787/helper/report-market-price";

// Периодичность (по умолчанию — каждые 12 часов)
const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? 12 * 60 * 60 * 1000);

// Ограничения и тайминги
const PER_ITEM_TIMEOUT_MS = Number(process.env.PER_ITEM_TIMEOUT_MS ?? 90_000);
const PER_ITEM_RETRIES = Number(process.env.PER_ITEM_RETRIES ?? 2);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 3);

// =========================
// ♻️ Долго-живущий инстанс браузера
// =========================
const hold = await HoldInstanceQueue.create({
  width: 1920,
  height: 900,
  headless: false,
  sessionBaseDir: "./session",
  profileName: "current",
  waitOnError: true,
  navigationTimeoutSecs: 60,
  extractor: async (page, url) => {
    // Небольшая пауза без page.waitForTimeout
    await page.evaluate(() => new Promise((r) => setTimeout(r, 500)));
    const data = await mainParser(page, url);
    return data ?? null;
  },
});

// =========================
// 🧰 Утилиты
// =========================
function isValidHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function withTimeout(promise, ms, msg = "Timed out") {
  let to;
  try {
    const killer = new Promise((_, rej) => {
      to = setTimeout(() => rej(new Error(msg)), ms);
    });
    return await Promise.race([promise, killer]);
  } finally {
    clearTimeout(to);
  }
}

function nowIso() {
  return new Date().toISOString();
}

// Простой лимитер параллелизма
function pLimit(concurrency) {
  const queue = [];
  let activeCount = 0;

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      const fn = queue.shift();
      fn();
    }
  };

  const run = async (fn, resolve, reject) => {
    activeCount++;
    try {
      const result = await fn();
      resolve(result);
    } catch (err) {
      reject(err);
    } finally {
      next();
    }
  };

  return (fn) =>
    new Promise((resolve, reject) => {
      const task = () => run(fn, resolve, reject);
      if (activeCount < concurrency) {
        task();
      } else {
        queue.push(task);
      }
    });
}

const limit = pLimit(CONCURRENCY);

// =========================
/** 🔁 Основной цикл: получить список — распарсить — отчитаться */
// =========================
async function runCycle() {
  const startedAt = nowIso();
  console.log(`\n[cycle] ▶️ Старт цикла в ${startedAt}`);
  let list;

  // 1) Забираем список URL
  try {
    const res = await fetch(SOURCE_URL, { method: "GET" });
    if (!res.ok) {
      throw new Error(`SOURCE_URL responded ${res.status}`);
    }
    list = await res.json();
    if (!Array.isArray(list)) {
      throw new Error("SOURCE_URL must return JSON-array [{id, url}, ...]");
    }
  } catch (e) {
    console.error("[cycle] ❌ Ошибка получения списка:", e?.message || e);
    return { ok: false, error: String(e?.message || e) };
  }

  console.log(`[cycle] 📥 Получено записей: ${list.length}`);

  // 2) Обрабатываем с ограничением параллелизма
  const tasks = list.map((item, idx) =>
    limit(async () => {
      const { id, url } = item ?? {};
      if (!id || !isValidHttpUrl(String(url))) {
        console.warn(`[item#${idx}] ⚠️ Пропуск: некорректные данные`, item);
        return {
          id,
          url,
          result: { ok: false, error: "Invalid item payload" },
          checkedAt: nowIso(),
        };
      }

      let attempt = 0;
      while (attempt <= PER_ITEM_RETRIES) {
        attempt++;
        try {
          const uniqueKey = `${url}::${Date.now()}::try${attempt}`;
          const result = await withTimeout(
            hold.enqueue(url, { uniqueKey }),
            PER_ITEM_TIMEOUT_MS,
            "Timed out waiting for parse result"
          );

          // 3) Отправляем результат на REPORT_URL
          const payload = {
            id,
            url,
            result, // то, что вернул парсер (ok/data/error — на вашей стороне)
            checkedAt: nowIso(),
          };

          try {
            const r = await fetch(REPORT_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            if (!r.ok) {
              throw new Error(`REPORT_URL responded ${r.status}`);
            }
          } catch (postErr) {
            console.error(
              `[item#${idx}] ❌ Ошибка отправки отчёта:`,
              postErr?.message || postErr
            );
          }

          console.log(
            `[item#${idx}] ✅ Готово (попытка ${attempt}/${
              PER_ITEM_RETRIES + 1
            })`
          );
          return payload;
        } catch (parseErr) {
          console.warn(
            `[item#${idx}] 🔁 Ошибка парсинга (попытка ${attempt}/${
              PER_ITEM_RETRIES + 1
            }):`,
            parseErr?.message || parseErr
          );
          if (attempt > PER_ITEM_RETRIES) {
            const failedPayload = {
              id,
              url,
              result: {
                ok: false,
                error: String(parseErr?.message || parseErr),
              },
              checkedAt: nowIso(),
            };
            try {
              await fetch(REPORT_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(failedPayload),
              });
            } catch (postErr) {
              console.error(
                `[item#${idx}] ❌ Ошибка отправки отчёта об ошибке:`,
                postErr?.message || postErr
              );
            }
            return failedPayload;
          }
        }
      }
    })
  );

  const results = await Promise.allSettled(tasks);
  const finishedAt = nowIso();
  const okCount = results.filter((r) => r.status === "fulfilled").length;
  console.log(
    `[cycle] ⏹ Завершено в ${finishedAt}. Успешно: ${okCount}/${results.length}`
  );

  return {
    ok: true,
    startedAt,
    finishedAt,
    total: results.length,
    okCount,
  };
}

// =========================
// 🌐 Мини-сервер для health и ручного запуска
// =========================
const app = new Hono();

app.use(
  "*",
  cors({
    origin: (origin) => origin ?? "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["*"],
    exposeHeaders: ["*"],
    maxAge: 86400,
    credentials: false,
  })
);

app.get("/", (c) => c.json({ ok: true, msg: "Cron + Hold crawler alive" }));

// Ручной запуск цикла
app.post("/run-now", async (c) => {
  try {
    const summary = await runCycle();
    return c.json({ ok: true, summary });
  } catch (e) {
    return c.json({ ok: false, error: String(e?.message || e) }, 500);
  }
});

serve({ fetch: app.fetch, hostname: HOST, port: PORT }, () => {
  console.log(`🚀 Server listening on http://${HOST}:${PORT}`);
});

// =========================
// ⏰ Планировщик: сразу + каждые 12 часов
// =========================
(async () => {
  // Мгновенный прогон при старте
  runCycle().catch((e) =>
    console.error("[bootstrap] Ошибка первого цикла:", e?.message || e)
  );

  // Затем — каждые INTERVAL_MS
  setInterval(() => {
    runCycle().catch((e) =>
      console.error("[interval] Ошибка цикла:", e?.message || e)
    );
  }, INTERVAL_MS);
})();

// =========================
// 🧹 Грейсфул-шатдаун
// =========================
const shutdown = async (signal) => {
  console.log(`\n[shutdown] Получен сигнал ${signal}, закрываю ресурсы…`);
  try {
    await hold?.close?.();
  } catch (e) {
    console.warn("[shutdown] Ошибка закрытия hold:", e?.message || e);
  } finally {
    process.exit(0);
  }
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
