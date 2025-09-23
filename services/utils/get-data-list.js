import { ceneo } from "../ceneo/index.js";
import { getDomainWithoutTLD } from "./urls.js";

export const mapAggregate = {
  ceneo: ceneo,
};

export const getDataList = async (page, url) => {
  const domain = getDomainWithoutTLD(url);
  const market = mapAggregate[domain];
  console.log({ market, domain });

  // Если парсер не найден
  if (!market) {
    console.log(`[parser] парсер для домена "${domain}" НЕ найден → ${url}`);
    return {
      data: null,
      error: { url, error: "Парсера нет" },
    };
  }

  const data = await market.getListUrls(page);

  return data;
};
