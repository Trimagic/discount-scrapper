/**
 * Извлекает текст доставки из блока <div class="texts">.
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ delivery: string | null }>}
 */
export async function extractDelivery(page) {
  try {
    const delivery = await page.$eval("div.texts .text.label", (el) =>
      el.textContent.replace(/\s+/g, " ").trim()
    );
    return { delivery };
  } catch {
    return { delivery: null };
  }
}
