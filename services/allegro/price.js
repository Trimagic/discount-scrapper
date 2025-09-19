/**
 * Берёт цену из строки "cena …" в секции Warunki oferty,
 * читая ТОЛЬКО соседние <span> после метки в том же родителе.
 * Игнорирует блоки ниже (рассрочка, "6 osób..." и т.п.).
 *
 * @returns {Promise<{ price: number|null, currency: string|null, raw?: string|null }>}
 */
export async function extractPrice(page) {
  try {
    return await page.evaluate(() => {
      const norm = (s) =>
        (s || "")
          .replace(/\u00A0/g, " ")
          .replace(/\s+/g, " ")
          .trim();

      const toNumber = (raw) => {
        if (!raw) return null;
        let v = String(raw)
          .replace(/[^\d.,\s-]/g, "")
          .replace(/\u00A0/g, " ")
          .replace(/(\d)\s+(?=\d{3}\b)/g, "$1");
        if (v.includes(",") && v.includes("."))
          v = v.replace(/\./g, "").replace(",", ".");
        else if (v.includes(",") && !v.includes(".")) v = v.replace(",", ".");
        else v = v.replace(/\s/g, "");
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };

      const section = document.querySelector(
        'section[aria-labelledby*="offer-terms-heading"]'
      );
      if (!section) return { price: null, currency: null };

      // Находим метку "cena" (именно <span>, как в твоём фрагменте)
      const label = Array.from(section.querySelectorAll("span")).find((el) =>
        /\bcena\b/i.test(el.textContent || "")
      );
      if (!label) return { price: null, currency: null };

      const parent = label.parentElement;
      if (!parent) return { price: null, currency: null };

      // Берём ТОЛЬКО прямых детей-<span> того же родителя и собираем те, что идут ПОСЛЕ метки
      const spans = Array.from(parent.querySelectorAll(":scope > span"));
      const i = spans.indexOf(label);
      if (i === -1) return { price: null, currency: null };

      // Обычно дальше идут: "4499," , "00" , "zł"
      const tail = spans
        .slice(i + 1, i + 5)
        .map((s) => norm(s.textContent || ""));
      // Склеим, убрав пустяки вроде одиночных неразрывных пробелов
      let joined = norm(tail.filter(Boolean).join(" "));

      // Fallback: если вдруг спаны пустые, возьмём текст родителя после "cena"
      if (!joined) {
        const full = norm(parent.innerText || parent.textContent || "");
        joined = norm(full.replace(/^[\s\S]*?\bcena\b/i, ""));
      }

      // Теперь в joined типа: "4499, 00 zł" / "4499,00 zł"
      const m = joined.match(
        /(\d{1,3}(?:[ \u00A0.,]\d{3})+|\d+)(?:[.,]\s?\d{1,2})?\s*(zł|PLN)?/i
      );
      if (!m) return { price: null, currency: null, raw: joined || null };

      const numericStr = m[0].replace(/(\d)[,.\s]+(\d{1,2})\b/, "$1,$2");
      const currency =
        (m[2] ? m[2].toUpperCase() : null) ||
        (/\bzł\b/i.test(joined) ? "PLN" : null);
      const price = toNumber(numericStr);

      return { price, currency, raw: joined };
    });
  } catch (e) {
    console.error("extractPriceByWarunkiOferty error:", e.message);
    return { price: null, currency: null };
  }
}
