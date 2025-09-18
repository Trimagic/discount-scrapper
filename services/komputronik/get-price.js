/**
 * Извлекает числовую цену из контейнера
 * <div data-price-type="final" …>4 099 zł</div>.
 *
 * @param {import('puppeteer').Page} page
 *   Экземпляр Puppeteer Page, уже открытой страницы.
 * @returns {Promise<{ price: number|null }>}
 *   Объект с числовой ценой (или null, если не удалось определить).
 */
export async function extractPrice(page) {
  try {
    const raw = await page.$eval('div[data-price-type="final"]', (el) =>
      el.textContent.trim()
    );

    // Пример: "4 099 zł" или "4 099 zł"
    // Убираем неразрывные пробелы, обычные пробелы и суффикс валюты
    const normalized = raw
      .replace(/\s/g, "") // убираем все пробелы/неразрывные
      .replace(/zł$/i, "") // убираем символ валюты (на всякий случай)
      .replace(",", "."); // если вдруг есть запятая

    const price = Number(normalized);
    return { price: isNaN(price) ? null : price };
  } catch (e) {
    console.error("Не удалось извлечь цену (final):", e.message);
    return { price: null };
  }
}
