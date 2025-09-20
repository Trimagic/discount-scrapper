/**
 * Надёжное извлечение брутто-цены:
 * - ждёт отрисовку (MutationObserver), 3 попытки с паузой 3s;
 * - учитывает, что "zł" может быть в соседнем/родительском узле;
 * - игнорирует участки "bez VAT".
 *
 * @param {import('puppeteer').Page} page
 * @param {{ retries?: number, delayMs?: number, timeoutMs?: number, log?: boolean }} [opts]
 * @returns {Promise<{ price: number|null }>}
 */
export async function extractPrice(page, opts = {}) {
  const { retries = 3, delayMs = 3000, timeoutMs = 5000, log = true } = opts;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  for (let i = 1; i <= retries; i++) {
    const res = await page.evaluate(
      async ({ timeoutMs }) => {
        const norm = (s) =>
          (s || "")
            .replace(/\u00A0/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        const scanNodes = () => {
          const nodes = Array.from(
            document.querySelectorAll("span,div,p,strong,b")
          );
          // берём узлы, где есть "zł" ИЛИ есть цена-подобный паттерн
          const priceLike = /\d{1,3}(?:[ \u00A0]\d{3})*(?:[.,]\d{2})/;
          return nodes.filter((el) => {
            const t = el.textContent || "";
            return /\bzł\b/i.test(t) || priceLike.test(t);
          });
        };

        let nodes = scanNodes();
        if (!nodes.length) {
          // ждём динамическую дорисовку
          nodes = await new Promise((resolve) => {
            const timer = setTimeout(() => {
              obs && obs.disconnect();
              resolve(scanNodes());
            }, timeoutMs);
            const obs = new MutationObserver(() => {
              const found = scanNodes();
              if (found.length) {
                clearTimeout(timer);
                obs.disconnect();
                resolve(found);
              }
            });
            obs.observe(document.body || document.documentElement, {
              childList: true,
              subtree: true,
              characterData: true,
            });
          });
        }

        if (!nodes.length) return { text: null, price: null };

        // Оцениваем кандидатов
        const candidates = nodes.map((el) => {
          const own = norm(el.textContent);
          const parent = norm(el.parentElement?.textContent || "");
          const ctx = (own + " " + parent).trim();

          const hasZl = /\bzł\b/i.test(ctx);
          const isNet = /bez\s*VAT/i.test(
            el.closest("div,section,article")?.textContent || ""
          );

          // 1) сначала пытаемся "число перед zł"
          let m = ctx.match(/(\d{1,3}(?:[ \u00A0]\d{3})*(?:[.,]\d{2})?)\s*zł/i);
          // 2) иначе просто первое денежное число в контексте
          if (!m) m = ctx.match(/(\d{1,3}(?:[ \u00A0]\d{3})*(?:[.,]\d{2}))/);

          const numStr = m ? m[1] : null;
          const parsed = numStr
            ? Number(numStr.replace(/[ \u00A0]/g, "").replace(",", "."))
            : null;

          // Скораем: брутто с "zł" выше, нетто — ниже
          let score = 0;
          if (hasZl) score += 3;
          if (!isNet) score += 2;
          if (parsed != null) score += parsed / 100000; // лёгкий тай-брейкер

          return { el, text: ctx, parsed, isNet, score };
        });

        // Берём лучший валидный parsed
        candidates.sort((a, b) => b.score - a.score);
        const best = candidates.find((c) => c.parsed != null);

        return best
          ? { text: best.text, price: best.parsed }
          : { text: null, price: null };
      },
      { timeoutMs }
    );

    if (log)
      console.log(
        `[price-robust] try ${i}/${retries} | parsed=${res.price} | text="${
          res.text || ""
        }"`
      );
    if (res.price != null) return { price: res.price };
    if (i < retries) await sleep(delayMs);
  }

  if (log) console.log("[price-robust] not found");
  return { price: null };
}

// Пример:
// const { price } = await extractPriceRobust(page, { log: true });
