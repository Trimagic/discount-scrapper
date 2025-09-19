/**
 * Извлекает URL основной картинки товара.
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ image: string|null }>}
 */
export async function extractImage(page) {
  try {
    // Ждём появление <img> внутри нужного слайдера
    await page.waitForSelector(
      "section.MainImagesSliderScss-singleSlideWrapper-1hS img",
      { visible: true, timeout: 8000 }
    );

    const image = await page.$eval(
      "section.MainImagesSliderScss-singleSlideWrapper-1hS img",
      (img) => img.getAttribute("src")?.trim() || null
    );

    return { image };
  } catch (e) {
    console.error("Не удалось извлечь URL картинки:", e.message);
    return { image: null };
  }
}
