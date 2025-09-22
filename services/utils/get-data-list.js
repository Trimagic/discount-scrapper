import { ceneo } from "../ceneo";

const mapAggregate = {
  ceneo: ceneo,
};

export const getDataList = (page, url) => {
  const domain = getDomainWithoutTLD(url);
  const market = mapAggregate[domain];

  // Если парсер не найден
  if (!market) {
    console.log(`[parser] парсер для домена "${domain}" НЕ найден → ${url}`);
    return {
      data: null,
      error: { url, error: "Парсера нет" },
    };
  }
};
