/**
 * Извлекает заголовок товара
 * из <h1 class="sc-94eb08bc-0 dPxwlD">…</h1>.
 *
 * @param {import('puppeteer').Page} page
 *   Экземпляр Puppeteer Page, уже открытой страницы.
 * @returns {Promise<{ title: string|null }>}
 *   Объект с текстом заголовка (или null, если элемент не найден).
 */
export async function extractTitle(page) {
  try {
    const title = await page.$eval("h1.sc-94eb08bc-0.dPxwlD", (el) =>
      el.textContent.trim()
    );

    return { title };
  } catch (e) {
    console.error(
      "Не удалось извлечь заголовок (h1.sc-94eb08bc-0.dPxwlD):",
      e.message
    );
    return { title: null };
  }
}
