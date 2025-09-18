// ──────────────────────────────────────────────────────────────────────────────
// Fingerprint: генератор/инжектор и кеш отпечатка на userDataDir
// ──────────────────────────────────────────────────────────────────────────────

import fs from "node:fs/promises";
import path from "node:path";
import { FingerprintGenerator } from "fingerprint-generator";
import { FingerprintInjector } from "fingerprint-injector";

export const FP_GEN = new FingerprintGenerator({
  browsers: [{ name: "chrome", minVersion: 140, maxVersion: 140 }],
  devices: ["desktop"],
  operatingSystems: ["windows"],
});

export const FP_INJECTOR = new FingerprintInjector();

/** Читает/создаёт стабильный отпечаток, привязанный к userDataDir */
export async function loadOrCreateFingerprint(userDataDir, opts = {}) {
  const base = {
    locales: [opts.locale || "pl-PL"],
    screen: { maxWidth: 1920, maxHeight: 1080 },
  };

  if (!userDataDir) {
    return FP_GEN.getFingerprint(base);
  }

  await fs.mkdir(userDataDir, { recursive: true }).catch(() => {});
  const fpFile = path.join(userDataDir, "fingerprint.json");
  try {
    const buf = await fs.readFile(fpFile, "utf8");
    return JSON.parse(buf);
  } catch {
    const fp = FP_GEN.getFingerprint(base);
    await fs.writeFile(fpFile, JSON.stringify(fp), "utf8").catch(() => {});
    return fp;
  }
}
