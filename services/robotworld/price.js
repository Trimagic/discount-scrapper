/**
 * Извлекает цену из <div.actionPrice>, возвращает число в zł.
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ price: number|null }>}
 */
export async function extractPrice(page) {
  try {
    const price = await page.$eval("div.actionPrice", (el) => {
      const raw = el.textContent.trim();

      // Убираем пробелы, валюту, приводим к формату с точкой
      const normalized = raw
        .replace(/\u00A0/g, " ") // неразрывные пробелы → обычные
        .replace(/\s/g, "") // все пробелы
        .replace("zł", "")
        .replace(",", ".");

      return Number(normalized);
    });

    return { price: isNaN(price) ? null : price };
  } catch (e) {
    console.error("Не удалось извлечь цену:", e.message);
    return { price: null };
  }
}
