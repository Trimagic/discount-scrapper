/**
 * Извлекает текст доставки (например: "DARMOWA DOSTAWA")
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ delivery: string | null }>}
 */
export async function extractDelivery(page) {
  try {
    const delivery = await page.evaluate(() => {
      const norm = (s) =>
        (s || "")
          .replace(/\u00A0/g, " ")
          .replace(/\s+/g, " ")
          .trim();

      // Ищем любой <span>, где встречается слово "dostawa" (регистр неважен)
      const el = [...document.querySelectorAll("span")].find((e) =>
        /dostawa/i.test(e.textContent || "")
      );

      return el ? norm(el.textContent) : null;
    });

    return { delivery };
  } catch (e) {
    console.error("Не удалось извлечь delivery:", e.message);
    return { delivery: null };
  }
}
