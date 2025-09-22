import { getFullDataMarket } from "../utils/get-full-data.js";
import { stripQueryParams } from "../utils/urls.js";

/**
 * Логирующая версия getListUrls:
 * — находит ссылки офферов
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
export async function getListUrls(page, onResolved) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  console.log("[getListUrls] ⏳ старт, жду 1с для прогрузки страницы…");
  await sleep(1000);

  console.log("[getListUrls] 🔎 ищу ссылки в .product-offer__logo a[href]");
  const rawLinks = await page.evaluate(() => {
    try {
      const anchors = Array.from(
        document.querySelectorAll(".product-offer__logo a[href]")
      );
      const abs = anchors
        .map((a) => {
          try {
            const href = a.getAttribute("href") || "";
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
  console.log(`[getListUrls] ✅ найдено ссылок: ${rawLinks.length}`);

  const referer = page.url();
  const dataOnly = [];

  for (const [i, originalUrl] of rawLinks.entries()) {
    let tab;
    console.log(
      `\n[getListUrls] ▶️ ${i + 1}/${rawLinks.length} => ${originalUrl}`
    );
    try {
      tab = await page.browser().newPage();
      tab.on("pageerror", (err) =>
        console.log(`[tab ${i + 1}] ⚠️ pageerror:`, err)
      );
      tab.on("console", (msg) =>
        console.log(`[tab ${i + 1}] 🖥 console:`, msg.text())
      );

      await tab.setExtraHTTPHeaders({
        Referer: referer,
        "Accept-Language": "pl-PL,pl;q=0.9,en-US;q=0.8,ru;q=0.7",
      });

      console.log(`[tab ${i + 1}] 🌐 goto original`);
      await tab.goto(originalUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
        referer,
      });

      // докрутка редиректов
      const deadline = Date.now() + 5000;
      let last = tab.url();
      console.log(`[tab ${i + 1}] ⏩ старт редиректов: ${last}`);
      while (Date.now() < deadline) {
        const nav = tab
          .waitForNavigation({ timeout: 500, waitUntil: "domcontentloaded" })
          .catch(() => null);
        await nav;

        const cur = tab.url();
        if (cur && cur !== last) {
          console.log(`[tab ${i + 1}] 🔁 redirect → ${cur}`);
          last = cur;
          await sleep(200);
          continue;
        }

        // meta refresh
        const metaUrl = await tab
          .evaluate(() => {
            try {
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
              return u || null;
            } catch {
              return null;
            }
          })
          .catch(() => null);

        if (metaUrl && metaUrl !== last) {
          const abs = /^https?:\/\//i.test(metaUrl)
            ? metaUrl
            : new URL(metaUrl, last || originalUrl).href;
          console.log(`[tab ${i + 1}] 🔄 meta-refresh → ${abs}`);
          await tab
            .goto(abs, {
              waitUntil: "domcontentloaded",
              timeout: 15000,
              referer: last || referer,
            })
            .catch((e) => console.log(`[tab ${i + 1}] ⚠️ meta goto err:`, e));
          last = tab.url();
          await sleep(200);
          continue;
        }

        console.log(`[tab ${i + 1}] ✅ редиректы завершены`);
        await sleep(250);
        break;
      }

      // финальный URL (именно его передаём в парсер!)
      let finalUrl = await tab
        .evaluate(() => window.location.href)
        .catch(() => null);
      if (!finalUrl) finalUrl = tab.url() || originalUrl;

      // для читаемости/логов — отдельно cleaned (не передаём его в парсер!)
      let cleanedUrl = finalUrl;
      try {
        const u = new URL(finalUrl);
        if (u.hostname.endsWith("ceneo.pl"))
          cleanedUrl = stripQueryParams(finalUrl);
      } catch {}

      const finalHost = (() => {
        try {
          return new URL(finalUrl).hostname;
        } catch {
          return "(invalid URL)";
        }
      })();

      console.log(`[tab ${i + 1}] 🔗 finalUrl: ${finalUrl}`);
      console.log(`[tab ${i + 1}] 🧹 cleanedUrl: ${cleanedUrl}`);
      console.log(`[tab ${i + 1}] 🏷 host: ${finalHost}`);

      // не запускаем парсер на страницах Ceneo или капче
      if (
        /(^|\.)ceneo\.pl$/i.test(finalHost) ||
        /\/Captcha\/Add/i.test(finalUrl)
      ) {
        console.log(
          `[tab ${
            i + 1
          }] ⛔ пропуск: домен ceneo.pl или капча, парсер не вызывается`
        );
        continue;
      }

      // ЯВНО логируем, что передаём в getFullDataMarket → finalUrl
      console.log(
        `[tab ${
          i + 1
        }] 🛠 getFullDataMarket(finalUrl= ${finalUrl}, host= ${finalHost})`
      );

      let data = null;
      try {
        data = await getFullDataMarket(tab, finalUrl);
        console.log(`[tab ${i + 1}] ✅ данные получены от парсера`);
      } catch (err) {
        console.log(
          `[tab ${
            i + 1
          }] ❌ ошибка парсера при вызове с finalUrl= ${finalUrl}:`,
          err
        );
      }

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
        dataOnly.push(data);
        console.log(`[tab ${i + 1}] ➕ добавлено в результирующий массив`);
      } else {
        console.log(`[tab ${i + 1}] ⚠️ парсер вернул пусто/ошибку`);
      }
    } catch (err) {
      console.log(`[tab ${i + 1}] ❌ критическая ошибка шага:`, err);
    } finally {
      try {
        if (tab) {
          await tab.close();
          console.log(`[tab ${i + 1}] 🔒 вкладка закрыта`);
        }
      } catch {}
      await sleep(700);
    }
  }

  console.log(
    `\n[getListUrls] 🏁 готово. Получено ${dataOnly.length} успешных результатов`
  );
  return dataOnly;
}
