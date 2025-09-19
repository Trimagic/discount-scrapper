/**
 * Извлекает краткую информацию о доставке (например, "Dostawa za darmo").
 * Источники: кнопка/линк ShippingInfo → общий поиск по видимому тексту с ключевыми словами.
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ delivery: string|null }>}
 */
export async function extractDelivery(page) {
  try {
    const delivery = await page.evaluate(() => {
      const norm = (s) =>
        (s || "")
          .replace(/\u00A0/g, " ")
          .replace(/\s+/g, " ")
          .trim();

      const isVisible = (el) => {
        if (!el) return false;
        const st = getComputedStyle(el);
        if (
          st.display === "none" ||
          st.visibility === "hidden" ||
          +st.opacity === 0
        )
          return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };

      // 1) Специальный блок Allegro: кнопка/ссылка с ShippingInfo
      const shipSelectors = [
        '[data-analytics-interaction-label="ShippingInfo"]',
        '[data-analytics-view-label="ShippingInfo"]',
        'a[href="#shipping-info"]',
        'button[href="#shipping-info"]',
      ];
      for (const sel of shipSelectors) {
        const el = document.querySelector(sel);
        if (el && isVisible(el)) {
          // Внутри обычно <div> с текстом "Dostawa za darmo"
          const txt = norm(el.textContent || "");
          if (txt) {
            // Вытащим короткую фразу про доставку, если есть
            const m =
              txt.match(/Dostawa[^|]+/i) ||
              txt.match(/Wysyłka[^|]+/i) ||
              txt.match(/Delivery[^|]+/i) ||
              txt.match(/Доставка[^|]+/i);
            return norm(m ? m[0] : txt);
          }
        }
      }

      // 2) Общий видимый текст с ключевыми словами (PL/EN/RU)
      const keywords = [
        /Dostawa[^|]+/i,
        /Wysyłka[^|]+/i,
        /Delivery[^|]+/i,
        /Shipping[^|]+/i,
        /Доставка[^|]+/i,
      ];

      // Сканируем ограниченно: кнопки и небольшие блоки рядом с иконкой доставки
      const candidates = Array.from(
        document.querySelectorAll(
          'button, a, [role="button"], [data-item], [data-analytics-enabled], div, span'
        )
      ).slice(0, 1000);

      for (const el of candidates) {
        if (!isVisible(el)) continue;
        const txt = norm(el.textContent || "");
        if (!txt) continue;
        for (const re of keywords) {
          const m = txt.match(re);
          if (m) return norm(m[0]);
        }
      }

      return null;
    });

    return { delivery: delivery || null };
  } catch (e) {
    console.error("extractDelivery error:", e.message);
    return { delivery: null };
  }
}
