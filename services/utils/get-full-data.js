import { eurocom } from "../euro.com/index.js";
import { mediaexpert } from "../mediaexpert/index.js";
import { komputronik } from "../komputronik/index.js";
import { mediamarkt } from "../mediamarkt/index.js";
import { maxelektro } from "../maxelektro/index.js";
import { neonet } from "../neonet/index.js";

import { getDomainWithoutTLD } from "./urls.js";

const map = {
  "euro.com": eurocom,
  mediaexpert,
  komputronik,
  mediamarkt,
  maxelektro,
  neonet,
};

/**
 * Получает цену с финальной страницы магазина.
 *
 * @param {import('puppeteer').Page} page  Страница Puppeteer, на которой открыт товар
 * @param {string} url                      Финальный URL товара
 * @returns {Promise<number|string|null>}   Найденная цена или null, если парсер отсутствует/ошибка
 */
export const getFullDataMarket = async (page, url) => {
  const domain = getDomainWithoutTLD(url);
  const market = map[domain];

  // Логируем то, что нашли
  if (market) {
    console.log(`[parser] найден парсер для домена "${domain}" → ${url}`);
  } else {
    console.log(`[parser] парсер для домена "${domain}" НЕ найден → ${url}`);
    return null;
  }

  try {
    const { price } = await market.extractPrice(page);
    const { image } = await market.extractImage(page);
    const { title } = await market.extractTitle(page);
    const { delivery } = await market.extractDelivery(page);
    console.log(`[parser] PRICE (${domain}):`, {
      price,
      image,
      title,
      delivery,
    });
    return { price, image, title, delivery };
  } catch (err) {
    console.log(
      `[parser] Ошибка при извлечении цены с ${domain}:`,
      err.message
    );
    return null;
  }
};
