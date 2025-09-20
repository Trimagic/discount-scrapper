/**
 * Возвращает URL основного изображения товара.
 * Ищет все <img>, фильтрует миниатюры (mini, thumb, sprite), выбирает самое подходящее.
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ image: string | null }>}
 */
export async function extractImage(page) {
  try {
    const image = await page.evaluate(() => {
      const toAbs = (url) => {
        try {
          return new URL(url, location.href).href;
        } catch {
          return null;
        }
      };
      const isBad = (s) => /(?:mini|thumb|sprite|icon)/i.test(s);
      const imgs = [...document.querySelectorAll("img")];

      // Берём все src
      const srcs = imgs
        .map((img) => img.getAttribute("src") || "")
        .map((s) => s.trim())
        .filter(Boolean)
        .map(toAbs)
        .filter(Boolean);

      if (!srcs.length) return null;

      // Сначала уберём миниатюры
      const nonThumbs = srcs.filter((s) => !isBad(s));
      const pool = nonThumbs.length ? nonThumbs : srcs;

      // Небольшой приоритет: webp/png/jpg без query, более «длинные» пути считаем детальнее
      const scored = pool
        .map((s) => {
          const ext = (s.match(/\.(webp|png|jpe?g)(?:$|\?)/i) || [, ""])[1];
          const noQuery = s.split("?")[0];
          const score =
            (ext ? 5 : 0) +
            (/\bimage|media|photo|product/i.test(noQuery) ? 3 : 0) +
            noQuery.length / 100; // лёгкий бонус за длину пути
          return { s, score };
        })
        .sort((a, b) => b.score - a.score);

      return scored[0]?.s || null;
    });

    return { image };
  } catch (e) {
    console.error("Не удалось извлечь image:", e.message);
    return { image: null };
  }
}
