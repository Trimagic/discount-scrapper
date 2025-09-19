/**
 * Извлекает заголовок товара.
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ title: string|null }>}
 */
export async function extractTitle(page) {
  try {
    // Ждём появления <h1> с классами name is-title
    await page.waitForSelector("h1.name.is-title", {
      visible: true,
      timeout: 5000,
    });

    const title = await page.$eval("h1.name.is-title", (el) =>
      (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim()
    );

    return { title };
  } catch (e) {
    console.error("Не удалось извлечь заголовок:", e.message);
    return { title: null };
  }
}
