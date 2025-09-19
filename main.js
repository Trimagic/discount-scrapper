/* eslint-disable no-console */
// run-hold.js — простой лаунчер для HoldInstance

import { HoldInstance } from "./instance/crawlee/simple.js";
import { allegro } from "./services/allegro/index.js";
import { ceneo } from "./services/ceneo/index.js";
import { eurocom } from "./services/euro.com/index.js";
import { komputronik } from "./services/komputronik/index.js";
import { maxelektro } from "./services/maxelektro/index.js";
import { mediaexpert } from "./services/mediaexpert/index.js";
import { mediamarkt } from "./services/mediamarkt/index.js";
import { neonet } from "./services/neonet/index.js";
import { getFullDataMarket } from "./services/utils/get-full-data.js";
//const URL = "https://www.google.com/";
//const URL = "https://www.ceneo.pl/183113257;02514#tab=click";
const URL =
  "https://allegro.pl/oferta/robot-sprzatajacy-dreame-x50-ultra-complete-bialy-17629033559";
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
  const { price } = await allegro.extractPrice(page);
  const { title } = await allegro.extractTitle(page);
  const { delivery } = await allegro.extractDelivery(page);
  const { image } = await allegro.extractImage(page);
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
