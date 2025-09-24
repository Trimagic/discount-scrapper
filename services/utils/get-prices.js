import { mapMarket } from "./get-full-data.js";
import { getDomainWithoutTLD } from "./urls.js";

/**
 * Получает только цену — как раньше
 */
export const getPriceMarket = async (page, url) => {
  const domain = getDomainWithoutTLD(url);
  const market = mapMarket[domain];

  if (!market) {
    console.log(`[parser] парсер для домена "${domain}" НЕ найден → ${url}`);
    return { data: null, error: { url, market: domain, error: "Парсера нет" } };
  }

  console.log(`[parser] найден парсер для домена "${domain}" → ${url}`);

  try {
    const { price } = await market.extractPrice(page);
    if (price == null) {
      console.log(`[parser] Не удалось извлечь цену (${domain})`);
      return {
        data: null,
        error: { url, market: domain, error: "Не удалось извлечь цену" },
      };
    }
    console.log(`[parser] PRICE (${domain}):`, price);
    return { data: { price, market: domain, url }, error: null };
  } catch (err) {
    console.log(
      `[parser] Ошибка при извлечении цены с ${domain}:`,
      err?.message ?? err
    );
    return {
      data: null,
      error: { url, market: domain, error: "Неизвестная ошибка" },
    };
  }
};

/**
 * Параллельно получает цены для списка URL, открывая несколько вкладок.
 *
 * @param {import('puppeteer').Page} page   — базовая вкладка из Crawlee
 * @param {Array<{ id:string, url:string }>} items
 * @param {{
 *   maxConcurrency?: number,        // сколько вкладок одновременно (по умолчанию 3)
 *   navigationTimeoutMs?: number,   // таймаут навигации
 *   networkIdleMs?: number,         // "тишина сети"
 *   warmupWaitMs?: number,          // доп. пауза перед разбором
 *   launchStaggerMs?: number        // разброс старта между задачами, чтобы не ударять по сайту (по умолчанию 150мс)
 * }} [opts]
 * @returns {Promise<Array<{ id:string, data:null | { price:number, market:string, url:string }, error: null | { url:string, market:string, error:string } }>>}
 */
export const getPricesForUrls = async (page, items, opts = {}) => {
  const NAV_TIMEOUT = opts.navigationTimeoutMs ?? 60_000;
  const NETWORK_IDLE_MS = opts.networkIdleMs ?? 1_200;
  const WARMUP_WAIT_MS = opts.warmupWaitMs ?? 500;
  const MAX_CONC = Math.max(1, Math.min(8, opts.maxConcurrency ?? 3));
  const LAUNCH_STAGGER_MS = opts.launchStaggerMs ?? 150;

  const browser = page.browser();
  const results = new Array(items.length);

  // семафор простым счётчиком
  let active = 0;
  let cursor = 0;

  const launchNext = async () => {
    const index = cursor++;
    if (index >= items.length) return;

    const { id, url } = items[index];
    active++;

    // легкий разброс старта, чтобы не бахать сразу все соединения
    if (LAUNCH_STAGGER_MS > 0) {
      await new Promise((r) => setTimeout(r, LAUNCH_STAGGER_MS * index));
    }

    const marketFromUrl = safeMarket(url);

    if (!isValidHttpUrl(url)) {
      results[index] = {
        id,
        data: null,
        error: { url, market: marketFromUrl, error: "Invalid URL" },
      };
      active--;
      // запускаем следующего
      await launchNext();
      return;
    }

    let tab;
    try {
      tab = await browser.newPage();
      // подхватим viewport как у базовой страницы
      try {
        const vp = await page.viewport();
        if (vp) await tab.setViewport(vp);
      } catch {}

      await tab.goto(url, {
        timeout: NAV_TIMEOUT,
        waitUntil: "domcontentloaded",
      });
      await waitNetworkIdleSafe(tab, NETWORK_IDLE_MS, NAV_TIMEOUT);
      await tab.evaluate(
        (ms) => new Promise((r) => setTimeout(r, ms)),
        WARMUP_WAIT_MS
      );

      const finalUrl = tab.url();
      const res = await getPriceMarket(tab, finalUrl);

      results[index] = { id, data: res.data, error: res.error };
    } catch (e) {
      console.log(`[batch] Ошибка обработки ${url}:`, e?.message ?? e);
      results[index] = {
        id,
        data: null,
        error: {
          url,
          market: marketFromUrl,
          error: "Навигация/загрузка не удалась",
        },
      };
    } finally {
      try {
        if (tab) await tab.close();
      } catch {}
      active--;
      // как только освободилась "ячейка" — запускаем следующего
      await launchNext();
    }
  };

  // запускаем до MAX_CONC воркеров
  const starters = Math.min(MAX_CONC, items.length);
  await Promise.all(Array.from({ length: starters }, () => launchNext()));

  return results;
};

/** Безопасно ждём «тишину сети», если метод доступен */
async function waitNetworkIdleSafe(page, idleMs, navTimeout) {
  if (typeof page.waitForNetworkIdle === "function") {
    try {
      await page.waitForNetworkIdle({
        idleTime: idleMs,
        timeout: Math.min(navTimeout, idleMs + 5_000),
      });
      return;
    } catch {
      // запасное ожидание ниже
    }
  }
  await page.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), idleMs);
}

function isValidHttpUrl(s) {
  try {
    const u = new URL(String(s));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function safeMarket(url) {
  try {
    return getDomainWithoutTLD(url) ?? "unknown";
  } catch {
    return "unknown";
  }
}
