/**
 * Извлекает полный URL изображения товара.
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ image: string | null }>}
 */
export async function extractImage(page) {
  try {
    const image = await page.$eval(
      'img[data-component="lazyLoad"].is-loaded',
      (el) => {
        // если src начинается с '/', превращаем в абсолютный
        const src = el.getAttribute("src") || "";
        if (src.startsWith("http")) return src;
        return `${location.origin}${src}`;
      }
    );
    return { image };
  } catch {
    return { image: null };
  }
}
