/**
 * Извлекает URL большого изображения из
 * <img class="slide-image-full" …>.
 *
 * @param {import('puppeteer').Page} page
 *   Экземпляр Puppeteer Page, уже открытой страницы.
 * @returns {Promise<{ image: string|null }>}
 *   Объект с URL (или null, если элемент не найден).
 */
export async function extractImage(page) {
  try {
    const image = await page.$eval(".slide-image-full", (el) =>
      el.getAttribute("src")
    );

    return { image: image || null };
  } catch (e) {
    console.error(
      "Не удалось извлечь изображение (slide-image-full):",
      e.message
    );
    return { image: null };
  }
}
