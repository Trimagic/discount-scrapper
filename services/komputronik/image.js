/**
 * Извлекает ссылку на основное изображение из контейнера
 * <div class="mx-auto ..."><img ...></div>.
 *
 * @param {import('puppeteer').Page} page
 *   Экземпляр Puppeteer Page, уже открытой страницы.
 * @returns {Promise<{ url: string|null }>}
 *   Объект с URL изображения (или null, если не удалось определить).
 */
export async function extractImage(page) {
  try {
    const image = await page.$eval(
      ".mx-auto img", // сам <img> внутри контейнера
      (el) => el.getAttribute("src")?.trim() || null
    );

    return { image: image || null };
  } catch (e) {
    console.error("Не удалось извлечь изображение (mx-auto img):", e.message);
    return { image: null };
  }
}
