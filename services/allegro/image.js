/**
 * Извлекает изображение товара устойчиво к смене классов.
 * Приоритет: JSON-LD(Product.image) → og:image → крупные <img> из галереи.
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ image: string|null, images: string[] }>}
 */
export async function extractImage(page) {
  try {
    const res = await page.evaluate(() => {
      const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));

      // Апскейлим allegroimg: /s128/, /s512/ → /original/
      const upgrade = (u) => {
        try {
          const url = new URL(u, location.href);
          if (url.hostname.endsWith("allegroimg.com")) {
            url.pathname = url.pathname.replace(/\/s\d+\//, "/original/");
            return url.toString();
          }
          return url.toString();
        } catch {
          return u;
        }
      };

      // Оценка "крупности": original > s1024 > s512 > s256 > s128
      const scoreSize = (u) => {
        if (!u) return 0;
        if (/\/original\//.test(u)) return 1e9;
        const m = u.match(/\/s(\d+)\//);
        return m ? parseInt(m[1], 10) : 1; // если нет маркера размера
      };

      // 1) JSON-LD Product.image
      const fromJsonLd = (() => {
        try {
          const scripts = Array.from(
            document.querySelectorAll('script[type="application/ld+json"]')
          );
          const out = [];
          for (const s of scripts) {
            let json;
            try {
              json = JSON.parse(s.textContent || "null");
            } catch {
              continue;
            }

            const collect = (node) => {
              if (!node || typeof node !== "object") return;
              const types = []
                .concat(node["@type"] || [])
                .map((t) => String(t).toLowerCase());
              if (types.includes("product")) {
                const imgs = []
                  .concat(node.image || node.images || [])
                  .flat()
                  .map((x) => (typeof x === "string" ? x : x?.url))
                  .filter(Boolean);
                out.push(...imgs);
              }
              Object.values(node).forEach(collect);
            };
            collect(json);
          }
          return out.map(upgrade);
        } catch {
          return [];
        }
      })();

      // 2) og:image / link rel="image_src"
      const fromMeta = (() => {
        const og =
          document.querySelector('meta[property="og:image"]')?.content || "";
        const link =
          document.querySelector('link[rel="image_src"]')?.href || "";
        return uniq([og, link]).map(upgrade);
      })();

      // 3) Основная галерея: берём крупные <img src> (без привязки к классам)
      const fromGallery = (() => {
        const imgs = Array.from(document.querySelectorAll("img[src]"));
        // фильтруем по домену и по alt (обычно alt содержит название товара)
        const candidates = imgs
          .map((img) => ({
            src: img.getAttribute("src"),
            alt: (img.getAttribute("alt") || "").trim(),
          }))
          .filter((it) => /allegroimg\.com/.test(it.src || ""))
          // отсекаем явные иконки/стрелки
          .filter((it) => !/arrowhead|icon|sprite|logo/i.test(it.src))
          // предпочитаем товарные картинки (alt не пустой или есть маркеры размеров)
          .filter(
            (it) => it.alt || /\/s(128|256|512|1024|original)\//.test(it.src)
          )
          .map((it) => upgrade(it.src));

        return uniq(candidates);
      })();

      const all = uniq([...fromJsonLd, ...fromMeta, ...fromGallery]);

      // Выбираем "лучшую" по размеру (original/s1024/…)
      const best =
        all.slice().sort((a, b) => scoreSize(b) - scoreSize(a))[0] || null;

      return { image: best || null, images: all };
    });

    return { image: res.image, images: res.images };
  } catch (e) {
    console.error("extractImage error:", e.message);
    return { image: null, images: [] };
  }
}
