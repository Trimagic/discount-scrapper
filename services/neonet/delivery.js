/**
 * Извлекает текст доставки (например, "Darmowa dostawa")
 * из блока productDeliveryCostScss-deliveryCost__text-3fk.
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ delivery: string|null }>}
 */
export async function extractDelivery(page) {
  try {
    // Ждём появления текста доставки
    await page.waitForSelector(
      ".productDeliveryCostScss-deliveryCost__text-3fk",
      { visible: true, timeout: 8000 }
    );

    const delivery = await page.$eval(
      ".productDeliveryCostScss-deliveryCost__text-3fk",
      (el) => el.textContent.replace(/\s+/g, " ").trim()
    );

    return { delivery };
  } catch (e) {
    console.error("Не удалось извлечь доставку:", e.message);
    return { delivery: null };
  }
}
