import { eurocom } from "../euro.com/index.js";
import { mediaexpert } from "../mediaexpert/index.js";
import { komputronik } from "../komputronik/index.js";
import { mediamarkt } from "../mediamarkt/index.js";
import { maxelektro } from "../maxelektro/index.js";
import { neonet } from "../neonet/index.js";

import { getDomainWithoutTLD } from "./urls.js";
import { allegro } from "../allegro/index.js";
import { avans } from "../avans/index.js";
import { digiexpert } from "../digiexpert/index.js";
import { electro } from "../electro/index.js";
import { oleole } from "../oleole/index.js";
import { robotworld } from "../robotworld/index.js";
import { senetic } from "../senetic/index.js";

export const mapMarket = {
  "euro.com": eurocom,
  mediaexpert,
  komputronik,
  mediamarkt,
  maxelektro,
  neonet,
  allegro,
  avans,
  digiexpert,
  electro,
  oleole,
  robotworld,
  senetic,
};

/**
 * Получает данные о товаре с финальной страницы магазина.
 * price — обязательное поле. image, title, delivery — опциональны.
 *
 * @param {import('puppeteer').Page} page  Страница Puppeteer, на которой открыт товар
 * @param {string} url                      Финальный URL товара
 * @returns {Promise<{
 *   data: null | {
 *     price:number,
 *     image?:string|null,
 *     title?:string|null,
 *     delivery?:string|null,
 *     market:string,      // ⬅️ домен без TLD
 *     url:string          // ⬅️ исходный URL
 *   },
 *   error: null | {url:string,error:string,market:string} // ⬅️ market тоже в ошибках
 * }>}
 */
export const getFullDataMarket = async (page, url) => {
  const domain = getDomainWithoutTLD(url);
  const market = mapMarket[domain];

  // Если парсер не найден
  if (!market) {
    console.log(`[parser] парсер для домена "${domain}" НЕ найден → ${url}`);
    return {
      data: null,
      error: { url, market: domain, error: "Парсера нет" }, // ⬅️
    };
  }

  console.log(`[parser] найден парсер для домена "${domain}" → ${url}`);

  try {
    const { price } = await market.extractPrice(page);

    // Цена обязательна
    if (price == null) {
      console.log(`[parser] Не удалось извлечь цену (${domain})`);
      return {
        data: null,
        error: { url, market: domain, error: "Не удалось извлечь цену" }, // ⬅️
      };
    }

    // Остальные поля опциональны
    let image = null;
    let title = null;
    let delivery = null;

    try {
      ({ image } = await market.extractImage(page));
    } catch {}
    try {
      ({ title } = await market.extractTitle(page));
    } catch {}
    try {
      ({ delivery } = await market.extractDelivery(page));
    } catch {}

    console.log(`[parser] PRICE (${domain}):`, {
      price,
      image,
      title,
      delivery,
    });

    return {
      data: { price, image, title, delivery, market: domain, url }, // ⬅️
      error: null,
    };
  } catch (err) {
    console.log(
      `[parser] Ошибка при извлечении данных с ${domain}:`,
      err.message
    );
    return {
      data: null,
      error: { url, market: domain, error: "Неизвестная ошибка" }, // ⬅️
    };
  }
};
