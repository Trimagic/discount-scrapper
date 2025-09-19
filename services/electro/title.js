/**
 * Извлекает название товара из <h1 class="name is-title">.
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ title: string | null }>}
 */
export async function extractTitle(page) {
  try {
    const title = await page.$eval("h1.name.is-title", (el) =>
      el.textContent.replace(/\s+/g, " ").trim()
    );
    return { title };
  } catch {
    return { title: null };
  }
}
