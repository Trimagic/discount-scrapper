/**
 * Извлекает URL основного изображения из блока .image-wrap
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ image: string | null }>}
 */
export async function extractImage(page) {
  try {
    const image = await page.$eval(".image-wrap__img", (el) =>
      el.getAttribute("src")
    );
    return { image };
  } catch (e) {
    console.error("Не удалось извлечь image:", e.message);
    return { image: null };
  }
}
