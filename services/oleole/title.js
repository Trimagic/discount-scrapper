/**
 * Извлекает заголовок товара из <h1 data-test="product-title">
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ title: string | null }>}
 */
export async function extractTitle(page) {
  try {
    const title = await page.$eval(
      'h1[data-test="product-title"] .product-intro__title-text',
      (el) => el.textContent.trim()
    );
    return { title };
  } catch (e) {
    console.error("Не удалось извлечь title:", e.message);
    return { title: null };
  }
}
