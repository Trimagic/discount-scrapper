/* eslint-disable no-console */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";

import { HoldInstance } from "./instance/crawlee/simple.js";
import { getFullDataMarket } from "./services/utils/get-full-data.js";

const HOST = process.env.HOST ?? "0.0.0.0";
const PORT = Number(process.env.PORT ?? 5000);

// Опции для каждого запроса (инстанс будет одноразовый)
const HOLD_OPTS = {
  width: 1920,
  height: 900,
  headless: false,
  sessionBaseDir: "./session",
  profileName: "parser3",
  keepOpenOnSuccess: false,
  waitOnError: true,
  navigationTimeoutSecs: 60,
};

const REQUEST_TIMEOUT_MS = 90_000;

function isValidHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function withTimeout(promise, ms, msg = "Timed out") {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(msg)), ms);
  });
  try {
    // Гонка промисов: либо основной завершается, либо таймаут бросает ошибку
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(t);
  }
}

const app = new Hono();
app.use("*", cors());

app.get("/healthz", (c) => {
  console.log("[server] GET /healthz");
  return c.json({ ok: true });
});

app.post("/parse", async (c) => {
  console.log("[parse] POST /parse received");

  const ct = c.req.header("content-type") || "";
  if (!ct.includes("application/json")) {
    console.warn("[parse] wrong content-type:", ct);
    return c.json({ error: "Content-Type must be application/json" }, 415);
  }

  let body;
  try {
    body = await c.req.json();
    console.log("[parse] body:", body);
  } catch {
    console.warn("[parse] invalid JSON");
    return c.json({ error: "Invalid JSON" }, 400);
  }

  // Используем имя reqUrl, чтобы не пересекаться с глобальным URL или случайными переменными
  const reqUrl = body?.url?.trim?.();
  if (!reqUrl || !isValidHttpUrl(reqUrl)) {
    console.warn("[parse] invalid url:", reqUrl);
    return c.json({ error: 'Field "url" must be a valid http(s) URL' }, 400);
  }

  const startedAt = Date.now();
  console.log(`[parse] start → ${reqUrl}`);

  const hold = await HoldInstance.create(HOLD_OPTS);

  try {
    // ⬇️ Возвращаем данные из колбэка и сразу их ждём
    const parseResult = await withTimeout(
      hold.open(reqUrl, async ({ page, request }) => {
        console.log("[hold] inside crawler callback");
        console.log("[hold] request.url:", request.url);

        const data = await getFullDataMarket(page, request.url);
        console.log("[hold] getFullDataMarket result:", data);

        return data; // ← ключевое изменение
      }),
      REQUEST_TIMEOUT_MS,
      `Parsing timed out after ${REQUEST_TIMEOUT_MS}ms`
    );

    const durationMs = Date.now() - startedAt;
    console.log(`[parse] ✓ done in ${durationMs}ms for ${reqUrl}`);

    // выпрямляем возможную форму { data, error }
    const payload =
      parseResult && typeof parseResult === "object" && "data" in parseResult
        ? parseResult.data
        : parseResult;

    if (!payload) {
      console.warn("[parse] parser returned no data");
      return c.json(
        { ok: false, url: reqUrl, error: "Parser returned no data" },
        500
      );
    }

    const sourceDomain = new URL(reqUrl).hostname;

    return c.json(
      { ok: true, url: reqUrl, sourceDomain, ...payload, durationMs },
      200
    );
  } catch (err) {
    console.error(`[parse] ✗ error for ${reqUrl}:`, err?.message || err);
    return c.json(
      { ok: false, url: reqUrl, error: String(err?.message || err) },
      500
    );
  } finally {
    console.log("[hold] stopping HoldInstance...");
    try {
      await hold.stop();
      console.log("[hold] HoldInstance stopped");
    } catch (e) {
      console.warn("[hold] hold.stop() warning:", e?.message || e);
    }
  }
});

console.log(`[server] Starting on http://${HOST}:${PORT}`);
serve({ fetch: app.fetch, port: PORT, hostname: HOST }, (info) =>
  console.log(`[server] Listening on http://${info.address}:${info.port}`)
);

// Корректное завершение
async function shutdown() {
  console.log("\n[server] shutdown signal received");
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
