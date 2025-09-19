/* eslint-disable no-console */
// run-hold.js — простой лаунчер для HoldInstance

import { HoldInstance } from "./instance/crawlee/index.js";
import { ceneo } from "./services/ceneo/index.js";
import { eurocom } from "./services/euro.com/index.js";
import { komputronik } from "./services/komputronik/index.js";
import { maxelektro } from "./services/maxelektro/index.js";
import { mediaexpert } from "./services/mediaexpert/index.js";
import { mediamarkt } from "./services/mediamarkt/index.js";
import { neonet } from "./services/neonet/index.js";

//const URL = "https://www.ceneo.pl/183113257;02514#tab=click";
const URL = "https://www.ceneo.pl/181610898;02514";
// ──────────────────────────────────────────────────────────────
// Функция для извлечения цены из страницы
// ──────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────
// Запуск HoldInstance
// ──────────────────────────────────────────────────────────────
const hold = await HoldInstance.create({
  profileName: "parser",
  headless: false,
  width: 1920,
  height: 900,
  locale: "pl-PL,pl;q=0.9,en-US;q=0.8,ru;q=0.7",
  stealth: true,
});

await hold.open(URL, async ({ page }) => {
  const data = await ceneo.getListUrls(page);

  console.log({ data });
});

// Ctrl+C → корректно закрываем
process.on("SIGINT", async () => {
  console.log("\nЗакрываю инстанс…");
  try {
    await hold.stop();
  } catch {}
  process.exit(0);
});
