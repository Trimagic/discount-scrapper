/**
 * Извлекает название товара из <h1.product-intro__title-h1>.
 *
 * @param {import('puppeteer').Page} page
 *   Экземпляр Puppeteer Page, уже открытой страницы.
 * @returns {Promise<{ title: string|null }>}
 *   Объект с названием товара (или null, если не удалось определить).
 */
export async function extractTitle(page) {
  try {
    const title = await page.$eval("h1.product-intro__title-h1", (el) =>
      el.textContent.trim()
    );

    return { title: title || null };
  } catch (e) {
    console.error(
      "Не удалось извлечь название товара (product-intro__title-h1):",
      e.message
    );
    return { title: null };
  }
}
