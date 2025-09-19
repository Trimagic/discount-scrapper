/**
 * Извлекает заголовок товара из <h1 class="productTitleCss-header-1aq">.
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ title: string|null }>}
 */
export async function extractTitle(page) {
  try {
    // Ждём появления h1 с классом productTitleCss-header-1aq
    await page.waitForSelector("h1.productTitleCss-header-1aq", {
      visible: true,
      timeout: 8000,
    });

    const title = await page.$eval("h1.productTitleCss-header-1aq", (el) =>
      el.textContent.replace(/\s+/g, " ").trim()
    );

    return { title };
  } catch (e) {
    console.error("Не удалось извлечь title:", e.message);
    return { title: null };
  }
}
