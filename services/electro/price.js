/**
 * Извлекает числовую цену из блока <div class="main-price price is-big">.
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ price: number | null }>}
 */
export async function extractPrice(page) {
  try {
    const price = await page.$eval("div.main-price.price.is-big", (el) => {
      const whole = el.querySelector(".whole")?.textContent || "";
      const cents = el.querySelector(".cents")?.textContent || "00";
      // убираем пробелы и собираем целую цену
      const raw = `${whole}.${cents}`.replace(/\s/g, "");
      return Number(raw);
    });
    return { price: isNaN(price) ? null : price };
  } catch {
    return { price: null };
  }
}
