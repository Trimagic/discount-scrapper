/**
 * Извлекает числовую цену из контейнера
 * <div class="price-current no-break  price-current-full">…</div>.
 *
 * @param {import('puppeteer').Page} page
 *   Экземпляр Puppeteer Page, уже открытой страницы.
 * @returns {Promise<{ price: number|null }>}
 *   Объект с числовой ценой (или null, если не удалось определить).
 */
export async function extractPrice(page) {
  try {
    // Получаем целую часть (внутри price-current-full, без вложенного div валюты)
    const whole = await page.$eval(
      ".price-current.no-break.price-current-full",
      (el) => {
        // Берём только прямой текст узла, игнорируя дочерние div'ы
        const ownText = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent)
          .join("")
          .trim();
        return ownText;
      }
    );

    // Получаем дробную часть (если есть)
    const fractional = await page
      .$eval(
        ".price-current.no-break.price-current-full .price-current-currency span:first-child",
        (el) => el.textContent.trim()
      )
      .catch(() => "00");

    const normalizedWhole = whole.replace(/\s/g, "");
    const normalizedFrac = fractional.replace(/\s/g, "");

    // Склеиваем и приводим к числу: 4099 + 00 → 4099.00
    const price = Number(`${normalizedWhole}.${normalizedFrac}`);
    return { price: isNaN(price) ? null : price };
  } catch (e) {
    console.error("Не удалось извлечь цену (price-current):", e.message);
    return { price: null };
  }
}
