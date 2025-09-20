/**
 * Извлекает текст доставки из <p.b-product__availability>.
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ delivery: string|null }>}
 */
export async function extractDelivery(page) {
  try {
    const delivery = await page.$eval("p.b-product__availability", (el) =>
      el.textContent.replace(/\s+/g, " ").trim()
    );
    return { delivery };
  } catch (e) {
    console.error("Не удалось извлечь delivery:", e.message);
    return { delivery: null };
  }
}
