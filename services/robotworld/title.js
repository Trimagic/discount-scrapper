/**
 * Извлекает название товара из <h1.b-product__title>,
 * игнорируя подзаголовок внутри <span>.
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ title: string|null }>}
 */
export async function extractTitle(page) {
  try {
    const title = await page.$eval("h1.b-product__title", (el) => {
      const clone = el.cloneNode(true);
      // Удаляем подзаголовок
      const span = clone.querySelector(".b-product__subtitle");
      if (span) span.remove();
      return clone.textContent.replace(/\s+/g, " ").trim();
    });
    return { title };
  } catch (e) {
    console.error("Не удалось извлечь title:", e.message);
    return { title: null };
  }
}
