/**
 * Извлекает URL изображения из блока с классом slick-slide
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ image: string | null }>}
 */
export async function extractImage(page) {
  try {
    const image = await page.$eval(
      'a.slick-slide img[itemprop="image"]',
      (el) => el.getAttribute("src")
    );
    return { image };
  } catch (e) {
    console.error("Не удалось извлечь image:", e.message);
    return { image: null };
  }
}
