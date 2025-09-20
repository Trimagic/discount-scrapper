/**
 * Извлекает числовую цену из <div class="net-price">
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ price: number | null }>}
 */
export async function extractPrice(page) {
  try {
    const price = await page.$eval(".net-price", (el) => {
      const text = el.textContent || "";

      // Убираем слово "netto" и валюту, пробелы и заменяем запятую на точку
      const normalized = text
        .replace(/netto/i, "")
        .replace(/zł/i, "")
        .replace(/\u00A0/g, "") // неразрывные пробелы
        .replace(/\s/g, "")
        .replace(",", ".")
        .trim();

      return Number(normalized);
    });

    return { price: isNaN(price) ? null : price };
  } catch (e) {
    console.error("Не удалось извлечь цену:", e.message);
    return { price: null };
  }
}
