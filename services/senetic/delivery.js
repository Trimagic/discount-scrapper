/**
 * Возвращает delivery как текст даты доставки.
 * Пробует несколько селекторов и fallback.
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

      // 1) Самый частый селектор даты
      let el =
        document.querySelector(
          ".product-shipping__row--cheepest-shipping .product-shipping__date"
        ) ||
        document.querySelector(
          ".product-shipping__info .product-shipping__date"
        ) ||
        document.querySelector(".product-shipping__date");

      if (el) return norm(el.textContent);

      // 2) Fallback: найти блок с меткой "Dostawa" и взять соседнюю дату
      const info = document.querySelector(".product-shipping__info");
      if (info) {
        const dateEl = info.querySelector(".product-shipping__date");
        if (dateEl) return norm(dateEl.textContent);
      }

      return null;
    });

    return { delivery };
  } catch (e) {
    console.error("Не удалось извлечь delivery:", e.message);
    return { delivery: null };
  }
}
