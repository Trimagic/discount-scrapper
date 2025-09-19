/* eslint-disable no-console */
// run-hold.js — простой лаунчер для HoldInstance

import { HoldInstance } from "./instance/crawlee/simple.js";
import { allegro } from "./services/allegro/index.js";
import { ceneo } from "./services/ceneo/index.js";
import { electro } from "./services/electro/index.js";
import { eurocom } from "./services/euro.com/index.js";
import { komputronik } from "./services/komputronik/index.js";
import { maxelektro } from "./services/maxelektro/index.js";
import { mediaexpert } from "./services/mediaexpert/index.js";
import { mediamarkt } from "./services/mediamarkt/index.js";
import { neonet } from "./services/neonet/index.js";
import { getFullDataMarket } from "./services/utils/get-full-data.js";
//const URL = "https://www.google.com/";
//const URL = "https://www.ceneo.pl/181663513";
const URL =
  "https://www.electro.pl/agd-male/agd-male-do-domu/odkurzacze-automatyczne/robot-sprzatajacy-roborock-saros-10-r?utm_source=ceneo&utm_medium=cpc&utm_content=2065153&utm_campaign=2025-09&utm_term=Roboty-sprzatajace&ceneo_spo=true&ceneo_cid=6b1cae4c-58bc-1c0e-cb29-18fa11573d7c";
// ──────────────────────────────────────────────────────────────
// Функция для извлечения цены из страницы
// ──────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────
// Запуск HoldInstance
// ──────────────────────────────────────────────────────────────
// const hold = await HoldInstance.create({
//   profileName: "parser",
//   headless: false,
//   width: 1920,
//   height: 900,
//   locale: "pl-PL,pl;q=0.9,en-US;q=0.8,ru;q=0.7",
//   stealth: true,
// });

const hold = await HoldInstance.create({
  width: 1920,
  height: 900,
  headless: false,

  // сессии
  sessionBaseDir: "./session", // базовая папка
  profileName: "parser2", // имя профиля → ./session/parser2
  // или можно так (перекроет два поля выше):
  // sessionDir: "./session/parser2",

  // поведение
  keepOpenOnSuccess: true,
  waitOnError: true,
  navigationTimeoutSecs: 60,
});

await hold.open(URL, async ({ page }) => {
  //const data = await getFullDataMarket(page, URL);
  const { price } = await electro.extractPrice(page);
  const { title } = await electro.extractTitle(page);
  const { delivery } = await electro.extractDelivery(page);
  const { image } = await electro.extractImage(page);
  // const data = await ceneo.getListUrls(page);
  console.log({ title, price, delivery, image });
});

// Ctrl+C → корректно закрываем
process.on("SIGINT", async () => {
  console.log("\nЗакрываю инстанс…");
  try {
    await hold.stop();
  } catch {}
  process.exit(0);
});
