/**
 * Извлекает текст "Wysyłamy najczęściej w 1 dzień roboczy"
 * из блока <div class="font-semibold text-blue-smalt leading-tight">…</div>.
 *
 * @param {import('puppeteer').Page} page
 *   Экземпляр Puppeteer Page, уже открытой страницы.
 * @returns {Promise<{ shipping: string|null }>}
 *   Объект с текстом (или null, если элемент не найден).
 */
export async function extractDelivery(page) {
  try {
    const delivery = await page.$eval(
      ".font-semibold.text-blue-smalt.leading-tight",
      (el) => el.textContent.trim()
    );

    return { delivery };
  } catch (e) {
    console.error(
      "Не удалось извлечь текст (font-semibold text-blue-smalt leading-tight):",
      e.message
    );
    return { delivery: null };
  }
}
