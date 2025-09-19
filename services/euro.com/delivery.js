/**
 * Извлекает текст доставки (например "już jutro!") из кнопки
 * <button data-aut-id="home-delivery-status">…</button>.
 *
 * @param {import('puppeteer').Page} page
 *   Экземпляр Puppeteer Page, уже открытой страницы.
 * @returns {Promise<{ delivery: string|null }>}
 *   Объект с текстом доставки (или null, если не удалось определить).
 */
export async function extractDelivery(page) {
  try {
    const delivery = await page.$eval(
      'button[data-aut-id="home-delivery-status"]',
      (el) => el.textContent.trim()
    );

    return { delivery: delivery || null };
  } catch (e) {
    console.error(
      "Не удалось извлечь текст доставки (home-delivery-status):",
      e.message
    );
    return { delivery: null };
  }
}
