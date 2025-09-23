import { getFullDataMarket } from "../utils/get-full-data.js";
import { stripQueryParams } from "../utils/urls.js";

/**
 * Мелкие утилиты
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isHttp = (url) => /^https?:\/\//i.test(url);

const hostnameOf = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
};

const isSkippable = (finalUrl) => {
  const host = hostnameOf(finalUrl);
  if (/(^|\.)ceneo\.pl$/i.test(host)) return true;
  if (/\/Captcha\/Add/i.test(finalUrl)) return true;
  return false;
};

/**
 * Извлекает абсолютные ссылки офферов со страницы Ceneo.
 * Возвращает массив уникальных URL.
 * @param {import('puppeteer').Page} page
 * @returns {Promise<string[]>}
 */
export async function extractOfferLinks(page) {
  // небольшая пауза, чтобы отрисовались офферы
  await sleep(700);

  const links = await page.evaluate(() => {
    try {
      const anchors = Array.from(
        document.querySelectorAll(".product-offer__logo a[href]")
      );
      const abs = anchors
        .map((a) => {
          const href = a.getAttribute("href") || "";
          try {
            return new URL(href, window.location.origin).href;
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      return Array.from(new Set(abs));
    } catch {
      return [];
    }
  });

  return links;
}

/**
 * Докручивает редиректы/JS/meta и возвращает фактический финальный URL.
 * @param {import('puppeteer').Page} tab
 * @param {string} originalUrl
 * @param {string} referer
 * @param {number} hardTimeoutMs - общий лимит (по умолчанию ~5с)
 * @returns {Promise<string>}
 */
async function resolveFinalUrl(
  tab,
  originalUrl,
  referer,
  hardTimeoutMs = 5000
) {
  // идём на оригинальный URL
  await tab.goto(originalUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
    referer,
  });

  const deadline = Date.now() + hardTimeoutMs;
  let lastUrl = tab.url();

  // небольшой цикл ожидания любых навигаций/meta-refresh
  while (Date.now() < deadline) {
    // ждём возможную навигацию
    const nav = await tab
      .waitForNavigation({ timeout: 500, waitUntil: "domcontentloaded" })
      .catch(() => null);

    const cur = tab.url();
    if (nav && cur && cur !== lastUrl) {
      lastUrl = cur;
      continue; // повторим до истечения времени
    }

    // meta refresh
    const metaUrl = await tab
      .evaluate(() => {
        try {
          const m = document.querySelector('meta[http-equiv="refresh" i]');
          if (!m) return null;
          const content = (m.getAttribute("content") || "").toLowerCase();
          const idx = content.indexOf("url=");
          if (idx === -1) return null;
          let u = content.slice(idx + 4).trim();
          if (
            (u.startsWith('"') && u.endsWith('"')) ||
            (u.startsWith("'") && u.endsWith("'"))
          ) {
            u = u.slice(1, -1);
          }
          return u || null;
        } catch {
          return null;
        }
      })
      .catch(() => null);

    if (metaUrl) {
      const abs = isHttp(metaUrl)
        ? metaUrl
        : new URL(metaUrl, lastUrl || originalUrl).href;

      await tab
        .goto(abs, {
          waitUntil: "domcontentloaded",
          timeout: 15_000,
          referer: lastUrl || referer,
        })
        .catch(() => null);

      lastUrl = tab.url();
      continue;
    }

    // ничего не произошло — выходим
    break;
  }

  // иногда location.href точнее (SPA/JS), поэтому пробуем прочитать его
  const fromWindow = await tab
    .evaluate(() => window.location.href)
    .catch(() => null);
  return fromWindow || lastUrl || originalUrl;
}

/**
 * Логирующая версия getListUrls (упрощённая):
 * — находит ссылки офферов (через extractOfferLinks)
 * — докручивает редиректы/js/meta
 * — вызывает getFullDataMarket ИСКЛЮЧИТЕЛЬНО с finalUrl (не cleaned)
 * — пропускает домены ceneo.pl и /Captcha
 * — возвращает массив валидных результатов парсера
 *
 * @param {import('puppeteer').Page} page
 * @param {(ctx: {
 *   tab: import('puppeteer').Page,
 *   original: string,
 *   finalUrl: string,
 *   cleanedUrl: string,
 *   data: any
 * }) => Promise<void>} [onResolved]
 * @returns {Promise<any[]>}
 */
/**
 * Усиленная версия getListUrls:
 * - аккуратно докручивает редиректы
 * - ждёт стабилизацию страницы (DOM/network), прожимает cookies
 * - делает до 3 повторов парсинга финального URL
 * - пропускает ceneo/captcha
 *
 * @param {import('puppeteer').Page} page
 * @param {(ctx: {
 *   tab: import('puppeteer').Page,
 *   original: string,
 *   finalUrl: string,
 *   cleanedUrl: string,
 *   data: any
 * }) => Promise<void>} [onResolved]
 * @returns {Promise<any[]>}
 */

export async function getListUrls(page, onResolved) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

  // === Настройки ===
  const CONCURRENCY = 3; // одновременно открытых вкладок
  const START_JITTER_MS = [120, 600]; // случайная задержка старта таска
  const BETWEEN_TABS_PAUSE_MS = 100; // пауза между "стартами" (минимальная)

  // Тайминги и поведение
  const REDIRECT_TIMEOUT_MS = 12000;
  const WARMUP_EXTRA_WAIT_MS = 1200;

  // Ожидания готовности (до вызова парсера)
  const NETWORK_IDLE_MS = 1200;
  const NETWORK_IDLE_WINDOW_MS = 6000;
  const DOM_STABLE_TICKS = 3;
  const DOM_STABLE_POLL_MS = 400;
  const DOM_STABLE_MAX_MS = 8000;

  // Евристика появления цены
  const PRICE_HINT_MAX_WAIT_MS = 7000;
  const PRICE_HINT_POLL_MS = 300;
  const PRICE_HINT_SELECTORS = [
    ".main-price .whole, .main-price.is-big .whole",
    "[data-marker='UIPriceSimple']",
    ".price, .product-price, .current-price, .sale-price",
    "meta[itemprop='price'], [itemprop='price']",
    'script[type="application/ld+json"]',
  ];

  console.log("[getListUrls] ⏳ старт…");

  const referer = page.url();
  const rawLinks = await extractOfferLinks(page);
  console.log(`[getListUrls] ✅ офферов найдено: ${rawLinks.length}`);

  // === helpers ===
  const waitForNetworkIdleSoft = async (tab, idleMs, maxWindowMs) => {
    const start = Date.now();
    let last = 0;
    let lastChange = Date.now();

    while (Date.now() - start < maxWindowMs) {
      try {
        const { ongoing } = await tab.evaluate(() => {
          const now = performance.now();
          const since = now - 1500;
          const reqs = performance
            .getEntriesByType("resource")
            .filter(
              (e) =>
                e.startTime >= since && e.initiatorType !== "xmlhttprequest"
            );
          return { ongoing: reqs.length };
        });

        if (ongoing === last) {
          if (Date.now() - lastChange >= idleMs) return true;
        } else {
          last = ongoing;
          lastChange = Date.now();
        }
      } catch {
        await sleep(idleMs);
        return true;
      }
      await sleep(200);
    }
    return false;
  };

  const waitForDomStabilized = async (tab) => {
    const start = Date.now();
    let lastLen = -1;
    let stable = 0;
    while (Date.now() - start < DOM_STABLE_MAX_MS) {
      const len = await tab
        .evaluate(() => document.body?.innerText?.length ?? 0)
        .catch(() => 0);
      if (len === lastLen) stable++;
      else {
        stable = 0;
        lastLen = len;
      }
      if (stable >= DOM_STABLE_TICKS) return true;
      await sleep(DOM_STABLE_POLL_MS);
    }
    return false;
  };

  const tryAcceptCookies = async (tab) => {
    const selectors = [
      "#onetrust-accept-btn-handler",
      'button[id*="accept"]',
      'button[aria-label*="accept" i]',
      'button:has-text("Akceptuj")',
      'button:has-text("Zgadzam")',
      ".cookie-accept, .cookies-accept, .consent-accept",
    ];
    for (const sel of selectors) {
      try {
        const btn = await tab.$(sel);
        if (btn) {
          await btn.click({ delay: 20 }).catch(() => {});
          await sleep(150);
        }
      } catch {}
    }
  };

  const gentleAutoscroll = async (tab) => {
    try {
      await tab.evaluate(async () => {
        const d = (ms) => new Promise((r) => setTimeout(r, ms));
        const step = Math.max(200, Math.floor(window.innerHeight * 0.6));
        for (let i = 0; i < 3; i++) {
          window.scrollBy(0, step);
          await d(220);
        }
        window.scrollBy(0, -Math.floor(step / 2));
      });
    } catch {}
  };

  const waitForPriceHints = async (tab) => {
    const start = Date.now();
    while (Date.now() - start < PRICE_HINT_MAX_WAIT_MS) {
      try {
        const seen = await tab.evaluate((sels) => {
          for (const s of sels) if (document.querySelector(s)) return true;
          return false;
        }, PRICE_HINT_SELECTORS);
        if (seen) return true;
      } catch {}
      await sleep(PRICE_HINT_POLL_MS);
    }
    return false;
  };

  // Пул с ограничением конкурентности
  async function runPool(items, limit, worker) {
    const results = [];
    let cursor = 0;

    async function runner(slot) {
      while (true) {
        const idx = cursor++;
        if (idx >= items.length) return;
        const res = await worker(items[idx], idx).catch((e) => {
          console.log(
            `[${idx + 1}/${items.length}] ❌ ошибка:`,
            e?.message || e
          );
          return null;
        });
        if (res != null) results.push(res);
        // небольшой сдвиг между стартами слотов, чтобы не бахнуть сеть
        await sleep(BETWEEN_TABS_PAUSE_MS);
      }
    }

    const workers = Array.from(
      { length: Math.min(limit, items.length) },
      (_, slot) => runner(slot)
    );
    await Promise.all(workers);
    return results;
  }

  // Один оффер (вкладка)
  const processOffer = async (originalUrl, i) => {
    // джиттер старта каждого таска (не одновременно бить магазины)
    await sleep(rand(...START_JITTER_MS));

    const browser = page.browser();
    if (!browser || (browser.isConnected && !browser.isConnected())) {
      throw new Error("Browser disconnected");
    }

    let tab;
    try {
      tab = await browser.newPage();
      await tab.setViewport({ width: 1280, height: 900 });
      await tab.setExtraHTTPHeaders({
        "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8",
        Referer: referer || "https://www.ceneo.pl/",
      });

      // 1) финальный URL
      const finalUrl = await resolveFinalUrl(
        tab,
        originalUrl,
        referer,
        REDIRECT_TIMEOUT_MS
      );

      // 2) cleaned для логов
      let cleanedUrl = finalUrl;
      try {
        const u = new URL(finalUrl);
        if (u.hostname.endsWith("ceneo.pl"))
          cleanedUrl = stripQueryParams(finalUrl);
      } catch {}

      // 3) фильтр мусора
      if (isSkippable(finalUrl)) {
        console.log(
          `[${i + 1}/${
            rawLinks.length
          }] ⛔ пропуск (ceneo/captcha): ${finalUrl}`
        );
        return null;
      }

      // 4) прогрев → один вызов парсера
      console.log(
        `[${i + 1}/${
          rawLinks.length
        }] 🛠 getFullDataMarket(finalUrl): ${finalUrl}`
      );

      if ((await tab.url()) !== finalUrl) {
        await tab
          .goto(finalUrl, {
            waitUntil: "domcontentloaded",
            timeout: REDIRECT_TIMEOUT_MS,
          })
          .catch(() => {});
      }

      await tryAcceptCookies(tab);
      await gentleAutoscroll(tab);
      await waitForDomStabilized(tab);
      await waitForNetworkIdleSoft(
        tab,
        NETWORK_IDLE_MS,
        NETWORK_IDLE_WINDOW_MS
      );
      await waitForPriceHints(tab);
      await sleep(WARMUP_EXTRA_WAIT_MS);

      const data = await getFullDataMarket(tab, finalUrl);

      if (typeof onResolved === "function") {
        await onResolved({
          tab,
          original: originalUrl,
          finalUrl,
          cleanedUrl,
          data,
        });
      }

      if (data != null) {
        console.log(`[${i + 1}/${rawLinks.length}] ➕ добавлено`);
        return data;
      } else {
        console.log(`[${i + 1}/${rawLinks.length}] ⚠️ парсер вернул пусто`);
        return null;
      }
    } finally {
      if (tab) await tab.close().catch(() => {});
    }
  };

  // Запуск пула
  const results = await runPool(rawLinks, CONCURRENCY, processOffer);

  console.log(
    `[getListUrls] 🏁 готово. Успешных результатов: ${results.length}`
  );
  return results;
}

/* Ожидаются внешние утилиты:
 * - extractOfferLinks(page)
 * - resolveFinalUrl(tab, originalUrl, referer, timeoutMs)
 * - isSkippable(url)
 * - getFullDataMarket(tab, finalUrl)
 */
