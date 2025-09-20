/**
 * Извлекает текст доставки (например: "już pojutrze!")
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ delivery: string | null }>}
 */
export async function extractDelivery(page) {
  try {
    const delivery = await page.$eval(
      '[data-aut-id="home-delivery-status"]',
      (el) => el.textContent.trim()
    );
    return { delivery };
  } catch (e) {
    console.error("Не удалось извлечь delivery:", e.message);
    return { delivery: null };
  }
}
