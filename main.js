// accept-cookie.js
import { StealthBrowser } from "./instance/v1.js";

(async () => {
  const sb = await StealthBrowser.launch({
    headless: false,
    userDataDir: "./.profile-demo",
    locale: "pl-PL,pl;q=0.9,en;q=0.8",
  });

  const page = await sb.newPage();
  await sb.gotoSafe(
    page,
    "https://www.mediaexpert.pl/agd/pralki-i-suszarki/pralki/pralka-electrolux-mew7f149bp-9kg-1400-obr"
  );

  // ждём 10 секунд
  await new Promise((r) => setTimeout(r, 10_000));

  // нормализация текста (убираем диакритику, приводим к верхнему регистру)
  function normalize(str) {
    return (str || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }

  // Популярные селекторы для OneTrust/Didomi/IAB/Custom
  const KNOWN_SELECTORS = [
    "#onetrust-accept-btn-handler",
    "button#onetrust-accept-btn-handler",
    "button[aria-label*='akcept'], button[aria-label*='Akcept'], button[aria-label*='AKCEPT']",
    "button[data-testid*='accept'], button[data-test*='accept'], button[data-gdpr*='accept']",
    "button.cookie-accept, .cookie-accept, .accept-all, button.accept-all",
    "#didomi-notice-agree-button, button#didomi-notice-agree-button",
  ];

  async function tryClickKnownSelectors(frame) {
    for (const sel of KNOWN_SELECTORS) {
      const el = await frame.$(sel);
      if (el) {
        await el.click().catch(() => {});
        return true;
      }
    }
    return false;
  }

  async function tryClickByText(frame, targetText) {
    // ищем по тексту среди button / [role=button] / a / div[role=button]
    return await frame.evaluate((rawText) => {
      const normalize = (s) =>
        (s || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .toUpperCase();

      const wanted = normalize(rawText);

      const nodes = [
        ...document.querySelectorAll(
          "button, [role='button'], a, div[role='button']"
        ),
      ];

      const candidate =
        nodes.find((n) => normalize(n.textContent).includes(wanted)) ||
        // иногда текст в атрибутах
        nodes.find(
          (n) =>
            normalize(n.getAttribute?.("aria-label"))?.includes(wanted) ||
            normalize(n.getAttribute?.("title"))?.includes(wanted)
        );

      if (candidate) {
        candidate.click();
        return true;
      }
      return false;
    }, targetText);
  }

  async function clickAcceptAll() {
    // 1) сначала пробуем в главном фрейме
    if (await tryClickKnownSelectors(page)) return true;
    if (await tryClickByText(page, "ZAAKCEPTUJ WSZYSTKIE")) return true;

    // 2) обходим все фреймы (CMP часто в iframe)
    const frames = page.frames();
    for (const f of frames) {
      try {
        if (await tryClickKnownSelectors(f)) return true;
        if (await tryClickByText(f, "ZAAKCEPTUJ WSZYSTKIE")) return true;
      } catch {}
    }
    return false;
  }

  const clicked = await clickAcceptAll();

  if (clicked) {
    console.log("✅ Кнопка «ZAAKCEPTUJ WSZYSTKIE» нажата");
  } else {
    console.log(
      "⚠️ Кнопка не найдена (возможно, другой текст/селектор или баннер уже скрыт)."
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Извлечение цены из div.main-price.is-big (whole + cents)
  // ─────────────────────────────────────────────────────────────
  async function extractMainPrice(page) {
    await page.waitForSelector("div.main-price.is-big", { timeout: 15000 });

    const res = await page.evaluate(() => {
      const normalize = (s) =>
        String(s || "")
          .replace(/\u00A0|\u202F|\s+/g, " ") // NBSP/NNBSP → обычные пробелы
          .replace(/[^\d., ]+/g, "") // убрать валюты и мусор
          .trim();

      const box = document.querySelector("div.main-price.is-big");
      if (!box) return null;

      const allNodes = Array.from(
        box.querySelectorAll("span, div, b, i, strong, em")
      );

      const byClassPart = (needle) =>
        allNodes.find((el) =>
          String(el.className || "")
            .toLowerCase()
            .includes(needle)
        );

      let wholeEl = byClassPart("whole");
      let centsEl = byClassPart("cents");

      let whole = wholeEl ? normalize(wholeEl.textContent) : "";
      let cents = centsEl ? normalize(centsEl.textContent) : "";

      // Fallback: парс из общего текста контейнера
      if (!whole || !cents) {
        const raw = normalize(box.textContent);
        // ловим "числа ... две цифры на конце" как копейки
        const m =
          raw.match(/(\d[\d\s.,]*)[^\d]*(\d{2})(?!\d)/) ||
          raw.match(/(\d[\d\s.,]*)$/);

        if (m) {
          if (!whole && m[1]) whole = m[1].trim();
          if (!cents && m[2]) cents = m[2];
        }
      }

      // очистка: из целой части убираем все точки/запятые
      whole = (whole || "")
        .replace(/[.,](\d{2})$/, "") // если в whole затесились копейки
        .replace(/[^\d\s]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[.,]/g, "");

      cents = (cents || "").replace(/\D/g, "").slice(0, 2);
      if (cents.length === 1) cents = cents + "0";
      if (!cents) cents = "00";

      // формат отображения: узкий неразрывный пробел и точка как десятичный
      const narrowNbsp = "\u202F";
      const wholeGrouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, narrowNbsp);
      const display = `${wholeGrouped}.${cents}`;

      const numeric = Number(`${whole}.${cents}`);

      return {
        whole,
        cents,
        display,
        value: Number.isFinite(numeric) ? numeric : null,
        rawText: normalize(box.textContent),
      };
    });

    if (!res) throw new Error("main-price.is-big не найден");
    return res;
  }

  try {
    const price = await extractMainPrice(page);
    console.log(
      "🧾 Цена:",
      price.display,
      "| value:",
      price.value,
      "| whole:",
      price.whole,
      "| cents:",
      price.cents
    );
    // Пример: display "3 099.99", value 3099.99
  } catch (e) {
    console.error("Не удалось извлечь цену:", e?.message || e);
  }

  console.log("Браузер открыт, закрой его вручную когда закончишь");
  sb.browser.on("disconnected", () => process.exit(0));
})();
