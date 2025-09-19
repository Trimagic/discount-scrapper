import { eurocom } from "../euro.com/index.js";
import { mediaexpert } from "../mediaexpert/index.js";
import { komputronik } from "../komputronik/index.js";
import { mediamarkt } from "../mediamarkt/index.js";
import { maxelektro } from "../maxelektro/index.js";
import { neonet } from "../neonet/index.js";

import { getDomainWithoutTLD } from "./urls.js";
import { allegro } from "../allegro/index.js";

const map = {
  "euro.com": eurocom,
  mediaexpert,
  komputronik,
  mediamarkt,
  maxelektro,
  neonet,
  allegro,
};

/**
 * Получает данные о товаре с финальной страницы магазина.
 * price — обязательное поле. image, title, delivery — опциональны.
 *
 * @param {import('puppeteer').Page} page  Страница Puppeteer, на которой открыт товар
 * @param {string} url                      Финальный URL товара
 * @returns {Promise<{data: null | {price:number,image?:string|null,title?:string|null,delivery?:string|null}, error: null | {url:string,error:string}}>}
 */
export const getFullDataMarket = async (page, url) => {
  const domain = getDomainWithoutTLD(url);
  const market = map[domain];

  // Если парсер не найден
  if (!market) {
    console.log(`[parser] парсер для домена "${domain}" НЕ найден → ${url}`);
    return {
      data: null,
      error: { url, error: "Парсера нет" },
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
        error: { url, error: "Не удалось извлечь цену" },
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
      data: { price, image, title, delivery },
      error: null,
    };
  } catch (err) {
    console.log(
      `[parser] Ошибка при извлечении данных с ${domain}:`,
      err.message
    );
    return {
      data: null,
      error: { url, error: "Неизвестная ошибка" },
    };
  }
};
