/**
 * Извлекает числовую цену из элемента с data-test="branded-price-whole-value".
 *
 * @param {import('puppeteer').Page} page
 *   Экземпляр Puppeteer Page, уже открытой страницы.
 * @returns {Promise<{ price: number|null }>}
 *   Объект с числовой ценой (или null, если не удалось определить).
 */
export async function extractPrice(page) {
  try {
    const raw = await page.$eval(
      '[data-test="branded-price-whole-value"]',
      (el) => el.textContent.trim()
    );

    // польский формат: "2 499" или "2 499,99"
    const normalized = raw
      .replace(/\s/g, "") // убираем пробелы/неразрывные
      .replace(",", "."); // если вдруг есть запятая

    const price = Number(normalized);
    return { price: isNaN(price) ? null : price };
  } catch (e) {
    console.error("Не удалось извлечь цену:", e.message);
    return { price: null };
  }
}
