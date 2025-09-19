/**
 * Извлекает числовую цену из контейнера
 * <div class="main-price is-big">…</div>.
 *
 * @param {import('puppeteer').Page} page
 *   Экземпляр Puppeteer Page, уже открытой страницы.
 * @returns {Promise<{ price: number|null }>}
 *   Объект с числовой ценой (или null, если не удалось определить).
 */
export async function extractPrice(page) {
  try {
    // Целая часть (например "4 099")
    const whole = await page.$eval(".main-price.is-big .whole", (el) =>
      el.textContent.trim()
    );

    // Дробная часть (например "00"), если нет — берём "00"
    const cents = await page
      .$eval(".main-price.is-big .cents", (el) => el.textContent.trim())
      .catch(() => "00");

    // Убираем пробелы/неразрывные пробелы и собираем число
    const normalizedWhole = whole.replace(/\s/g, "");
    const normalizedCents = cents.replace(/\s/g, "");

    const price = Number(`${normalizedWhole}.${normalizedCents}`);
    return { price: isNaN(price) ? null : price };
  } catch (e) {
    console.error("Не удалось извлечь цену (main-price):", e.message);
    return { price: null };
  }
}
