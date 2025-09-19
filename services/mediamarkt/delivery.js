/**
 * Находит текст доставки, ориентируясь на текст "Dostępny online",
 * а не на конкретные классы.
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ delivery: string|null }>}
 */
export async function extractDelivery(page) {
  try {
    // Ждём появления текста "Dostępny online" на странице
    await page.waitForFunction(
      () =>
        !!document.evaluate(
          '//p[normalize-space(text())="Dostępny online"]',
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        ).singleNodeValue,
      { timeout: 5000 }
    );

    const delivery = await page.evaluate(() => {
      const dostepny = document.evaluate(
        '//p[normalize-space(text())="Dostępny online"]',
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue;

      if (!dostepny) return null;

      // Родитель первого p (div)
      const container = dostepny.closest("div");
      if (!container) return null;

      // Родитель всего блока (верхний flex)
      const root = container.parentElement;
      if (!root) return null;

      // Ищем соседний div (не тот, где сам Dostępny online)
      const siblings = Array.from(root.children);
      const otherDiv = siblings.find((el) => el !== container);
      if (!otherDiv) return null;

      // Берем первый p внутри него
      const p = otherDiv.querySelector("p");
      return p ? p.textContent.trim() : null;
    });

    return { delivery };
  } catch (e) {
    console.error("Не удалось извлечь текст доставки:", e.message);
    return { delivery: null };
  }
}
