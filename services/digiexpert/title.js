/**
 * Извлекает заголовок товара из <h1 variant="page">
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ title: string | null }>}
 */
export async function extractTitle(page) {
  try {
    const title = await page.$eval('h1[variant="page"]', (el) =>
      el.textContent.trim()
    );
    return { title };
  } catch (e) {
    console.error("Не удалось извлечь title:", e.message);
    return { title: null };
  }
}
