/**
 * Извлекает ссылку на основное изображение из контейнера
 * <div class="image-wrap"><img ...></div>.
 *
 * @param {import('puppeteer').Page} page
 *   Экземпляр Puppeteer Page, уже открытой страницы.
 * @returns {Promise<{ url: string|null }>}
 *   Объект с URL изображения (или null, если не удалось определить).
 */
export async function extractImage(page) {
  try {
    const image = await page.$eval(
      ".image-wrap__img",
      (el) => el.getAttribute("src")?.trim() || null
    );

    return { image: image || null };
  } catch (e) {
    console.error(
      "Не удалось извлечь изображение (image-wrap__img):",
      e.message
    );
    return { image: null };
  }
}
