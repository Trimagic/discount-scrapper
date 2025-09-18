/**
 * Извлекает числовую цену из структуры вида:
 * <span data-marker="UIPriceSimple">
 *   <span class="uiPriceSimpleScss-integer-1oF">4 099</span>
 *   <span class="uiPriceSimpleScss-decimal-cwe">,</span>
 *   <span class="uiPriceSimpleScss-fraction-51v">00</span>
 *   <span class="uiPriceSimpleScss-currency-NcH"> zł</span>
 * </span>
 *
 * @param {import('puppeteer').Page} page
 *   Экземпляр Puppeteer Page, уже открытой страницы.
 * @returns {Promise<{ price: number|null }>}
 *   Объект с числовой ценой (или null, если не удалось определить).
 */
export async function extractPrice(page) {
  try {
    const raw = await page.$eval('[data-marker="UIPriceSimple"]', (root) => {
      const integer =
        root.querySelector(".uiPriceSimpleScss-integer-1oF")?.textContent || "";
      const fraction =
        root.querySelector(".uiPriceSimpleScss-fraction-51v")?.textContent ||
        "00";
      // склеиваем без разделителей, т.к. decimal-span лишь хранит символ запятой
      return `${integer},${fraction}`.trim();
    });

    // нормализация польского формата: "4 099,00" → "4099.00"
    const normalized = raw
      .replace(/\s/g, "") // убираем пробелы/неразрывные
      .replace(",", "."); // заменяем запятую на точку

    const price = Number(normalized);
    return { price: isNaN(price) ? null : price };
  } catch (e) {
    console.error("Не удалось извлечь цену (UIPriceSimple):", e.message);
    return { price: null };
  }
}
