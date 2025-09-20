/**
 * Извлекает информацию о доставке.
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ delivery: string | null }>}
 */
export async function extractDelivery(page) {
  try {
    const delivery = await page.$eval(
      ".c-headline .c-headline_title.a-typo.is-secondary.is-date",
      (el) => {
        const words = el.querySelector(".is-dateInWords")?.textContent || "";
        const date = el.childNodes[1]?.textContent || "";
        return `${words} ${date}`.replace(/\s+/g, " ").trim();
      }
    );
    return { delivery };
  } catch {
    return { delivery: null };
  }
}
