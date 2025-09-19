/**
 * Извлекает краткий текст доставки (например, "jutro")
 * из нескольких возможных источников на странице.
 *
 * Порядок проверки:
 * 1) Кнопка рядом с "U Ciebie": aria-label="U Ciebie jutro"
 * 2) Текст внутри этой же кнопки
 * 3) Мобильный заголовок "Dostawa jutro"
 * 4) Блок "W sklepie ...": берём "jutro"
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ delivery: string|null }>}
 */
export async function extractDelivery(page) {
  try {
    // Прокрутим к блоку с доступностью — помогает ленивой отрисовке
    await page.evaluate(() => {
      const el =
        document.querySelector(
          ".calendar-delivery-label.item.is-availability"
        ) ||
        document.querySelector(".delivery.is-mobile") ||
        document.querySelector("#section_offer-available");
      if (el) el.scrollIntoView({ block: "center" });
    });

    // Ждём, пока появится любой из источников
    await page.waitForFunction(
      () => {
        const q = (s) => document.querySelector(s);
        return (
          q(
            '.calendar-delivery-label .delivery-button[aria-label*="U Ciebie"]'
          ) ||
          q(".calendar-delivery-label .delivery-button") ||
          q(".delivery.is-mobile .heading") ||
          q(".pos-delivery-label .is-link")
        );
      },
      { timeout: 15000 }
    );

    const delivery = await page.evaluate(() => {
      const norm = (s) => (s || "").replace(/\s+/g, " ").trim();

      // 1) aria-label="U Ciebie X"
      const btnAria = document.querySelector(
        '.calendar-delivery-label .delivery-button[aria-label*="U Ciebie"]'
      );
      if (btnAria) {
        const label = norm(btnAria.getAttribute("aria-label"));
        const m = label.match(/U Ciebie\s+(.+)$/i);
        if (m && m[1]) return norm(m[1]); // например "jutro"
      }

      // 2) Текст внутри той же кнопки
      const btn = document.querySelector(
        ".calendar-delivery-label .delivery-button"
      );
      if (btn) {
        const inner = norm(btn.textContent);
        if (inner) return inner; // часто просто "jutro"
      }

      // 3) Мобильный заголовок: "Dostawa jutro"
      const mob = document.querySelector(".delivery.is-mobile .heading");
      if (mob) {
        const txt = norm(mob.textContent); // "Dostawa jutro"
        // попытаемся взять слово после "Dostawa"
        const m = txt.match(/Dostawa\s+(.+)$/i);
        return m && m[1] ? norm(m[1]) : txt;
      }

      // 4) В магазине: "W sklepie jutro"
      const inStore = document.querySelector(".pos-delivery-label .is-link");
      if (inStore) return norm(inStore.textContent);

      return null;
    });

    return { delivery: delivery || null };
  } catch (e) {
    console.error("extractDelivery error:", e.message);
    return { delivery: null };
  }
}
