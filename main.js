/* eslint-disable no-console */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";

import { HoldInstanceQueue } from "./instance/crawlee/simple.js";
import { mainParser } from "./services/utils/main-parser.js";
import { getPricesForUrls } from "./services/utils/get-prices.js";

const HOST = process.env.HOST ?? "0.0.0.0";
const PORT = Number(process.env.PORT ?? 5000);

// Единый долго-живущий инстанс
const hold = await HoldInstanceQueue.create({
  width: 1920,
  height: 900,
  headless: false,
  sessionBaseDir: "./session",
  profileName: "current",
  waitOnError: true,
  navigationTimeoutSecs: 60,

  /**
   * extractor(page, url, opts)
   * opts: { mode?: "full" | "price", items?: Array<{id:string,url:string}> }
   */
  extractor: async (page, url, { mode = "full", items } = {}) => {
    // небольшая задержка для прогрузки страницы
    console.log({ items });
    await page.evaluate(() => new Promise((r) => setTimeout(r, 500)));

    if (mode === "price") {
      // Если пришёл массив — обрабатываем батчем.
      if (Array.isArray(items) && items.length) {
        return await getPricesForUrls(page, items);
      }
      // Иначе — одиночный URL
    }

    // 🔎 полный парсинг (по умолчанию)
    return await mainParser(page, url);
  },
});

const app = new Hono();
// CORS до всех роутов
app.use(
  "*",
  cors({
    // Разрешить любой Origin (и работать с null origin — например из file:// или расширений)
    origin: (origin) => origin ?? "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["*"], // или перечисли явно: ["content-type", "authorization", ...]
    exposeHeaders: ["*"],
    maxAge: 86400,
    credentials: false, // если нужно с куками/Authorization и credentials — смотри примечание ниже
  })
);

app.get("/", (c) => c.json({ ok: true, msg: "Hold crawler alive" }));

app.post("/parse", async (c) => {
  try {
    const body = await c.req.json();
    const url = String(body?.url || "");
    if (!isValidHttpUrl(url)) {
      return c.json({ ok: false, error: "Invalid URL" }, 400);
    }

    // Если не пришёл uniqueKey — генерим, чтобы избежать дедупликации
    const uniqueKey = body?.uniqueKey ?? `${url}::${Date.now()}`;
    const TIMEOUT_MS = Number(body?.timeoutMs ?? 90_000);

    const result = await withTimeout(
      hold.enqueue(url, { uniqueKey }),
      TIMEOUT_MS,
      "Timed out waiting for parse result"
    );

    return c.json(result);
  } catch (e) {
    return c.json({ ok: false, error: String(e?.message || e) }, 500);
  }
});

app.post("/parse-urls", async (c) => {
  try {
    const body = await c.req.json();
    const urls = Array.isArray(body) ? body : [];

    if (!urls.length) {
      return c.json({ ok: false, error: "No URLs provided" }, 400);
    }

    const TIMEOUT_MS = Number(body?.timeoutMs ?? 90_000);

    // Один уникальный ключ на весь батч
    const uniqueKey = `batch::${Date.now()}::${urls.length}`;

    // Единый запуск: передаём items внутрь extractor
    const results = await withTimeout(
      hold.enqueue("https://example.com/", {
        uniqueKey: `batch::${Date.now()}::${urls.length}`,
        mode: "price",
        items: urls,
      }),
      TIMEOUT_MS,
      "Timed out waiting for parse result"
    );

    const data = await fetch(
      "http://localhost:8787/helper/report-market-price",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(results.data),
      }
    ).then((res) => console.log("SUCCESS"));

    // extractor вернёт массив [{ id, data, error }, ...]
    return c.json({ ok: true, results });
  } catch (e) {
    return c.json({ ok: false, error: String(e?.message || e) }, 500);
  }
});

serve({ fetch: app.fetch, hostname: HOST, port: PORT }, () => {
  console.log(`🚀 Server listening on http://${HOST}:${PORT}`);
});

// helpers
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
    const kill = new Promise(
      (_, rej) => (to = setTimeout(() => rej(new Error(msg)), ms))
    );
    return await Promise.race([promise, kill]);
  } finally {
    clearTimeout(to);
  }
}
