/* eslint-disable no-console */
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "@hono/cors";
import { HoldInstance } from "../hold/HoldInstance.js";

const PORT = Number(process.env.PORT || 4333);
const AUTH_TOKEN = process.env.AUTH_TOKEN || null; // "secret123"

// ── глобальное состояние одной «удерживаемой» вкладки
let current = {
  instance: null, // HoldInstance
  url: null,
  openedAt: null,
};

// ── миддлварка авторизации (если задан AUTH_TOKEN)
const auth = async (c, next) => {
  if (!AUTH_TOKEN) return next();
  const hdr = c.req.header("authorization") || "";
  const token = hdr.replace(/^Bearer\s+/i, "");
  if (token !== AUTH_TOKEN) {
    return c.json({ ok: false, error: "Unauthorized" }, 401);
  }
  await next();
};

const app = new Hono();

// CORS
app.use(
  "*",
  cors({ origin: "*", allowHeaders: ["Authorization", "Content-Type"] })
);

// health
app.get("/health", (c) => c.json({ ok: true, ts: Date.now() }));

// статус
app.get("/status", auth, (c) =>
  c.json({
    ok: true,
    active: !!current.instance,
    url: current.url,
    openedAt: current.openedAt,
  })
);

// открыть URL и «держать»
// body: { url: string, replace?: boolean, opts?: HoldOpts }
app.post("/open", auth, async (c) => {
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: "Invalid JSON body" }, 400);
  }
  const url = body?.url;
  const replace = body?.replace !== false; // default: true
  const opts = body?.opts || {};

  if (!url || typeof url !== "string") {
    return c.json({ ok: false, error: "Missing 'url' string" }, 400);
  }

  if (current.instance && !replace) {
    return c.json(
      {
        ok: false,
        error: "Already holding a page. Pass { replace: true } to replace.",
        current: { url: current.url, openedAt: current.openedAt },
      },
      409
    );
  }

  try {
    // гасим предыдущую вкладку (если была)
    if (current.instance) {
      try {
        await current.instance.stop();
      } catch (e) {
        console.warn("stop() failed:", e?.message || e);
      }
    }

    // создаём и открываем новую
    const hold = await HoldInstance.create({
      headless: opts.headless ?? false,
      userDataDir: opts.userDataDir,
      locale: opts.locale ?? "pl-PL,pl;q=0.9,en;q=0.8",
      timezone: opts.timezone, // например, "Europe/Warsaw"
      disableServiceWorker: opts.disableServiceWorker ?? false,

      // сеть/стелс
      stealth: opts.stealth ?? true,
      proxy: opts.proxy,
      userAgent:
        opts.userAgent ??
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",

      // окно
      width: opts.width ?? 1920,
      height: opts.height ?? 900,
      args: Array.isArray(opts.args) ? opts.args : [],

      // webgl
      webglVendor: opts.webglVendor ?? "Google Inc. (NVIDIA)",
      webglRenderer:
        opts.webglRenderer ??
        "ANGLE (NVIDIA, NVIDIA GeForce RTX 4050 Laptop GPU (0x000028E1) Direct3D11 vs_5_0 ps_5_0, D3D11)",

      // гео
      geolocation: opts.geolocation || null, // { latitude, longitude, accuracy }
    });

    // держим «вечно»; onReady — место для первичной инициализации
    hold
      .open(url, async ({ page }) => {
        console.log(`[hold] opened: ${url}`);
        try {
          await page.waitForSelector("title", { timeout: 0 });
          console.log("[hold] title:", await page.title());
        } catch {}
      })
      .catch((e) => console.error("[hold] open() error:", e?.message || e));

    current = { instance: hold, url, openedAt: Date.now() };

    return c.json({
      ok: true,
      message: "Opening and holding the page",
      url,
      opts: {
        headless: !!(opts.headless ?? false),
        width: opts.width ?? 1920,
        height: opts.height ?? 900,
      },
      replace,
    });
  } catch (e) {
    console.error("failed to open:", e);
    return c.json({ ok: false, error: e?.message || String(e) }, 500);
  }
});

// остановить
app.post("/stop", auth, async (c) => {
  if (!current.instance)
    return c.json({ ok: true, stopped: false, message: "Nothing to stop" });
  try {
    await current.instance.stop();
  } catch (e) {
    console.warn("stop() error:", e?.message || e);
  } finally {
    current = { instance: null, url: null, openedAt: null };
  }
  return c.json({ ok: true, stopped: true });
});

// ── graceful shutdown
const server = serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`[hono] listening on :${PORT}`);
});
const shutdown = async () => {
  try {
    if (current.instance) await current.instance.stop();
  } catch {}
  try {
    server.close?.();
  } catch {}
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
