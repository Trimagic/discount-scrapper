/**
 * Извлекает ссылку на главное изображение товара.
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ image: string | null }>}
 */
export async function extractImage(page) {
  try {
    const image = await page.$eval("div.magnification-image img", (el) =>
      el.getAttribute("src")
    );
    return { image };
  } catch {
    return { image: null };
  }
}
