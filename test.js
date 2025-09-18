import fs from "node:fs/promises";
import path from "node:path";
import { StealthBrowser } from "./instance/v1.js";

(async () => {
  const sb = await StealthBrowser.launch({
    headless: "new",
    userDataDir: "./.profile-demo",
    locale: "pl-PL,pl;q=0.9,en;q=0.8",
  });

  const page = await sb.newPage();
  await page.goto(
    "https://www.euro.com.pl/suszarki/haier-x11-hd90-a3q397u1-s-i-refresh-pro-66cm-9kg.bhtml",
    { waitUntil: "domcontentloaded" }
  );

  // Создаём папку для скринов, если её нет
  const shotsDir = path.resolve("./screenshots");
  await fs.mkdir(shotsDir, { recursive: true });

  async function getPrice() {
    try {
      const price = await page.$eval(".price-template__large--total", (el) =>
        el.textContent.trim()
      );
      console.log(`[${new Date().toLocaleTimeString()}] Цена:`, price);
    } catch (e) {
      console.log(
        `[${new Date().toLocaleTimeString()}] Не удалось найти цену:`,
        e.message
      );
      const file = path.join(shotsDir, `price-error-${Date.now()}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log("Скриншот сохранён:", file);
    }
  }

  // Первый вызов сразу
  await getPrice();

  // Каждые 30 секунд
  setInterval(getPrice, 5_000);
})();
