import { getDataList, mapAggregate } from "./get-data-list.js";
import { getFullDataMarket, mapMarket } from "./get-full-data.js";
import { getDomainWithoutTLD } from "./urls.js";

export const mainParser = async (page, url) => {
  const domain = getDomainWithoutTLD(url);

  const aggregate = mapAggregate[domain];
  const market = mapMarket[domain];

  if (!!aggregate) {
    return await getDataList(page, url);
  }

  if (!!market) {
    return await getFullDataMarket(page, url);
  }
};
