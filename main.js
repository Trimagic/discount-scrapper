/* eslint-disable no-console */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";

import { HoldInstanceQueue } from "./instance/crawlee/simple.js";
import { getFullDataMarket } from "./services/utils/get-full-data.js";

const HOST = process.env.HOST ?? "0.0.0.0";
const PORT = Number(process.env.PORT ?? 5000);

// Единый долго-живущий инстанс
const hold = await HoldInstanceQueue.create({
  width: 1920,
  height: 900,
  headless: "new",
  sessionBaseDir: "./session",
  profileName: "parser3",
  waitOnError: true,
  navigationTimeoutSecs: 60,

  extractor: async (page, url) => {
    // задержка 500мс без waitForTimeout (puppeteer-core)
    await page.evaluate(() => new Promise((r) => setTimeout(r, 500)));
    // твоя доменная логика
    const data = await getFullDataMarket(page, url);
    return data ?? null;
  },
});

const app = new Hono();
app.use("*", cors());

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

    return c.json({ ok: true, url, result });
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
