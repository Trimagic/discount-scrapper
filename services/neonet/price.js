/**
 * Извлекает числовую цену из блока с data-marker="UIPriceSimple"
 * без использования waitForFunction.
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ price: number|null }>}
 */
export async function extractPrice(page) {
  try {
    // Ждём появления контейнера с ценой
    const sel = '[data-marker="UIPriceSimple"]';
    await page.waitForSelector(sel, { visible: true, timeout: 12000 });

    // Берём полный текст цены, например "5 349,00 zł"
    const raw = await page.$eval(sel, (el) => el.textContent.trim());

    // Приводим польский формат "5 349,00" к числу
    const normalized = raw
      .replace(/\u00A0|\u202F/g, "") // убираем неразрывные пробелы
      .replace(/\s/g, "") // обычные пробелы
      .replace(",", ".") // запятая в точку
      .replace(/[^\d.]/g, ""); // убираем валюту и прочее

    const price = Number(normalized);
    return { price: isNaN(price) ? null : price };
  } catch (e) {
    console.error("Не удалось извлечь цену:", e.message);
    return { price: null };
  }
}
