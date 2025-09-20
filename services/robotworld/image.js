/**
 * Извлекает ссылку на изображение товара.
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ image: string|null }>}
 */
export async function extractImage(page) {
  try {
    const image = await page.$eval(
      "div.slick-slide.slick-current.slick-active img",
      (el) => el.getAttribute("src")?.trim() || null
    );
    return { image };
  } catch (e) {
    console.error("Не удалось извлечь image:", e.message);
    return { image: null };
  }
}
