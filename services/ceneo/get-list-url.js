import { getFullDataMarket } from "../utils/get-full-data.js";
import { stripQueryParams } from "../utils/urls.js";

/**
 * Собирает ссылки внутри .product-offer__logo, поочерёдно открывает их
 * (пауза 1с), выполняет пользовательский код ПОСЛЕ редиректа
 * и возвращает финальные URL.
 *
 * @param {import('puppeteer').Page} page
 * @param {(ctx: {
 *   tab: import('puppeteer').Page,
 *   original: string,
 *   finalUrl: string,
 *   cleanedUrl: string,
 *   price: string | number | null,
 * }) => Promise<void>} [onResolved]
 * @returns {Promise<{ finalUrls: string[], results: { original: string, final: string }[] }>}
 */
export async function getListUrls(page, onResolved) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 1) Собираем абсолютные href и убираем дубли
  const rawLinks = await page.evaluate(() => {
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
  });

  const finalUrls = [];
  const results = [];
  const referer = page.url();

  // 2) Поочерёдно открываем каждую ссылку
  for (const originalUrl of rawLinks) {
    let tab;
    try {
      tab = await page.browser().newPage();

      await tab.setExtraHTTPHeaders({
        Referer: referer,
        "Accept-Language": "pl-PL,pl;q=0.9,en-US;q=0.8,ru;q=0.7",
      });

      const resp = await tab.goto(originalUrl, {
        waitUntil: "networkidle2",
        timeout: 30_000,
        referer,
      });

      let finalUrl =
        (typeof resp?.url === "function" ? resp.url() : null) || tab.url();

      // 2.1) Ждём возможные JS-редиректы (до ~3с)
      const end = Date.now() + 3000;
      let last = finalUrl;
      while (Date.now() < end) {
        await sleep(200);
        const current = tab.url();
        if (current !== last) {
          last = current;
          finalUrl = current;
          await sleep(300);
        }
      }

      // 2.2) Fallback на <meta http-equiv="refresh">
      try {
        const metaUrl = await tab.evaluate(() => {
          const m = document.querySelector('meta[http-equiv="refresh" i]');
          if (!m) return null;
          const c = (m.getAttribute("content") || "").toLowerCase();
          const idx = c.indexOf("url=");
          if (idx === -1) return null;
          let u = c.slice(idx + 4).trim();
          if (
            (u.startsWith('"') && u.endsWith('"')) ||
            (u.startsWith("'") && u.endsWith("'"))
          ) {
            u = u.slice(1, -1);
          }
          try {
            return new URL(u, window.location.origin).href;
          } catch {
            return null;
          }
        });

        if (metaUrl && metaUrl !== finalUrl) {
          const resp2 = await tab.goto(metaUrl, {
            waitUntil: "networkidle2",
            timeout: 15_000,
            referer: finalUrl,
          });
          finalUrl =
            (typeof resp2?.url === "function" ? resp2.url() : null) ||
            tab.url();

          const end2 = Date.now() + 1500;
          let last2 = finalUrl;
          while (Date.now() < end2) {
            await sleep(150);
            const cur2 = tab.url();
            if (cur2 !== last2) {
              last2 = cur2;
              finalUrl = cur2;
              await sleep(200);
            }
          }
        }
      } catch {}

      // ─────────────────────────────────────────────────────────
      // ── CUSTOM LOGIC START (выполняется ПОСЛЕ редиректа):
      const cleanedUrl = stripQueryParams(finalUrl); // убираем все query/hash
      const price = await getFullDataMarket(tab, cleanedUrl); // пробуем вытащить цену парсером

      // Если нужен сторонний хук — вызываем после того, как мы уже получили цену
      if (typeof onResolved === "function") {
        await onResolved({
          tab,
          original: originalUrl,
          finalUrl,
          cleanedUrl,
          price,
        });
      }
      // ── CUSTOM LOGIC END
      // ─────────────────────────────────────────────────────────

      finalUrls.push(cleanedUrl);
      results.push({ original: originalUrl, final: cleanedUrl });
    } catch (err) {
      finalUrls.push(`Ошибка для ${originalUrl}: ${err.message}`);
      results.push({ original: originalUrl, final: `Ошибка: ${err.message}` });
    } finally {
      try {
        if (tab) await tab.close();
      } catch {}
      await sleep(1000); // пауза 1с между ссылками
    }
  }

  return { finalUrls, results };
}
