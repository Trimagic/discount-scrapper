export async function extractTitle(page) {
  try {
    // подождём появления блока заголовка
    await page.waitForSelector(
      '[data-box-name="showoffer.productHeader"] [data-role="app-container"] h1, [data-role="app-container"] h1, h1',
      { timeout: 15000 }
    );

    const title = await page.evaluate(() => {
      const norm = (s) =>
        (s || "")
          .replace(/\u00A0/g, " ")
          .replace(/\s+/g, " ")
          .trim();
      const isVisible = (el) => {
        if (!el) return false;
        const s = window.getComputedStyle(el);
        if (
          s.display === "none" ||
          s.visibility === "hidden" ||
          +s.opacity === 0
        )
          return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };

      // 1) максимально точный корень по атрибутам
      const root =
        document.querySelector(
          '[data-box-name="showoffer.productHeader"] [data-role="app-container"]'
        ) ||
        document.querySelector('[data-role="app-container"]') ||
        document;

      // 2) сначала ищем явный <h1> внутри корня
      const h1s = Array.from(root.querySelectorAll("h1"));
      const visH1 = h1s.find(isVisible);
      if (visH1) return norm(visH1.textContent);

      // 3) резерв: роли заголовка
      const roleH1 = Array.from(
        root.querySelectorAll('[role="heading"][aria-level="1"]')
      ).find(isVisible);
      if (roleH1) return norm(roleH1.textContent);

      // 4) доп. резерв по типовым атрибутам названия (если вдруг не <h1>)
      const attrName = root.querySelector(
        '[itemprop="name"], [data-testid="offer-title"], [data-analytics-view-label="offerTitle"]'
      );
      if (attrName && isVisible(attrName)) return norm(attrName.textContent);

      // 5) крайний fallback: первый видимый <h1> по всему документу
      const anyH1 = Array.from(document.querySelectorAll("h1")).find(isVisible);
      return anyH1 ? norm(anyH1.textContent) : null;
    });

    return { title: title || null };
  } catch (e) {
    console.error("extractTitle error:", e.message);
    return { title: null };
  }
}
