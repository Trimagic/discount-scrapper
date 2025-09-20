/**
 * Извлекает числовую цену из блока <div class="price-template__large">
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ price: number | null }>}
 */
export async function extractPrice(page) {
  try {
    const price = await page.$eval(".price-template__large", (el) => {
      const whole =
        el.querySelector(".price-template__large--total")?.textContent || "";
      const decimal =
        el.querySelector(".price-template__large--decimal")?.textContent ||
        "00";

      // убираем пробелы и собираем в формат 3999.00
      const raw = `${whole.replace(/\s/g, "")}.${decimal.replace(/\D/g, "")}`;
      return Number(raw);
    });
    return { price: isNaN(price) ? null : price };
  } catch (e) {
    console.error("Не удалось извлечь цену:", e.message);
    return { price: null };
  }
}
