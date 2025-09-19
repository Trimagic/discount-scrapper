/**
 * Извлекает URL первой картинки товара из слайдера.
 *
 * Берёт первый слайд с реальным изображением (не data:),
 * при наличии предпочитает атрибут `src`, иначе `data-original`.
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<{ image: string|null }>}
 */
export async function extractImage(page) {
  try {
    // Ждём, пока появится хотя бы один слайд с картинкой
    await page.waitForSelector(
      ".product-gallery-view .spark-slider .spark-slide .spark-image img",
      {
        visible: true,
        timeout: 5000,
      }
    );

    const image = await page.evaluate(() => {
      // Ищем все изображения в слайдере по порядку
      const imgs = Array.from(
        document.querySelectorAll(
          ".product-gallery-view .spark-slider .spark-slide .spark-image img"
        )
      );

      // Функция выбора валидного URL (не data:)
      const pick = (img) => {
        const src = (img.getAttribute("src") || "").trim();
        const dataOriginal = (img.getAttribute("data-original") || "").trim();

        // предпочитаем src, если это не data:
        if (src && !src.startsWith("data:")) return src;
        // если src заглушка — пробуем data-original
        if (dataOriginal && !dataOriginal.startsWith("data:"))
          return dataOriginal;

        return null;
      };

      // Берём первый валидный URL
      for (const img of imgs) {
        const url = pick(img);
        if (url) return url;
      }

      // На крайний случай — вернём первый src как есть (может быть data:)
      return imgs[0]?.getAttribute("src")?.trim() || null;
    });

    return { image };
  } catch (e) {
    console.error("Не удалось извлечь URL картинки:", e.message);
    return { image: null };
  }
}
