/**
 * Извлекает URL изображения товара
 * из <img class="sc-68628bc4-1 kDrCpj pdp-gallery-image">.
 *
 * @param {import('puppeteer').Page} page
 *   Экземпляр Puppeteer Page, уже открытой страницы.
 * @returns {Promise<{ image: string|null }>}
 *   Объект с URL (или null, если элемент не найден).
 */
export async function extractImage(page) {
  try {
    const image = await page.$eval(
      "img.sc-68628bc4-1.kDrCpj.pdp-gallery-image",
      (el) => el.getAttribute("src")
    );

    return { image };
  } catch (e) {
    console.error(
      "Не удалось извлечь изображение (img.sc-68628bc4-1.kDrCpj.pdp-gallery-image):",
      e.message
    );
    return { image: null };
  }
}
