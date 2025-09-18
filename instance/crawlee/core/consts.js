/* eslint-disable no-console */
// ──────────────────────────────────────────────────────────────────────────────
// Константы и дефолтные настройки
// ──────────────────────────────────────────────────────────────────────────────

import { Configuration } from "crawlee";

Configuration.set("systemInfoV2", true);

// ≈ 23 дня в секундах
export const BIG_TIMEOUT_SECS = 2_000_000;

// Дефолтные параметры инстанса
export const DEFAULTS = {
  headless: false,
  width: 1920,
  height: 900,
  locale: "ru-RU,ru;q=0.9,en;q=0.8",
  stealth: true,
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  // Под твою среду (см. дампы): Minsk. Можно сменить на Europe/Warsaw.
  timezone: "Europe/Minsk",
  geolocation: null, // { latitude, longitude, accuracy }
  proxy: null, // "http://user:pass@host:port"
  webglVendor: "Google Inc. (NVIDIA)",
  webglRenderer:
    "ANGLE (NVIDIA, NVIDIA GeForce RTX 4050 Laptop GPU (0x000028E1) Direct3D11 vs_5_0 ps_5_0, D3D11)",
  disableServiceWorker: false,
};
