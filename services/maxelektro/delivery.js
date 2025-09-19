/**
 * Извлекает текст "Koszty dostawy od 0.00 zł"
 * из кнопки <button class="delivery-costs-toggle">…</button>.
 *
 * @param {import('puppeteer').Page} page
 *   Экземпляр Puppeteer Page, уже открытой страницы.
 * @returns {Promise<{ shippingCost: string|null }>}
 *   Объект с текстом (или null, если элемент не найден).
 */
export async function extractDelivery(page) {
  try {
    const delivery = await page.$eval(".delivery-costs-toggle", (el) =>
      el.textContent.replace(/\s+/g, " ").trim()
    );

    return { delivery };
  } catch (e) {
    console.error(
      "Не удалось извлечь текст (delivery-costs-toggle):",
      e.message
    );
    return { delivery: null };
  }
}
