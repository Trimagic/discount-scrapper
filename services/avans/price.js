/**
 * Возвращает актуальную цену (zł) и игнорирует блок скидки.
 * Приоритет:
 * 1) .c-offerBox_price .a-price_new
 * 2) .a-price_new.is-big
 * 3) max среди всех .a-price_new вне .c-offerBox_discount
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ price: number | null }>}
 */
export async function extractPrice(page) {
  try {
    const val = await page.evaluate(() => {
      const readNode = (el) => {
        const attr = el.getAttribute("data-price");
        if (attr && /^\d+$/.test(attr)) return Number(attr) / 100;
        const whole = el.querySelector(".a-price_price")?.textContent || "";
        const rest = el.querySelector(".a-price_rest")?.textContent || "00";
        const cents = rest.match(/\d+/)?.[0] || "00";
        const n = Number(`${whole.replace(/\s/g, "")}.${cents}`);
        return Number.isFinite(n) ? n : null;
      };

      // 1) Явно основная цена
      const preferred =
        document.querySelector(".c-offerBox_price .a-price_new") ||
        document.querySelector(".a-price_new.is-big");

      if (preferred) {
        const v = readNode(preferred);
        if (v != null) return v;
      }

      // 2) Все кандидаты, но без скидочного блока
      const candidates = Array.from(document.querySelectorAll(".a-price_new"))
        .filter((el) => !el.closest(".c-offerBox_discount"))
        .map((el) => readNode(el))
        .filter((v) => v != null);

      if (candidates.length) {
        return Math.max(...candidates);
      }
      return null;
    });

    return { price: val ?? null };
  } catch {
    return { price: null };
  }
}
