import { HoldInstance } from "./instance/crawlee/index.js";

const hold = await HoldInstance.create({
  profileName: "alex", // → ./session/alex
  // userDataDir: "./session/alex-custom", // можешь задать явно
  headless: "new",
  width: 1920,
  height: 900,
  locale: "pl-PL,pl;q=0.9,en;q=0.8",
  // proxy: "http://user:pass@host:port",
});

await hold.open("https://www.euro.com.pl/", async ({ page }) => {
  // тут можешь делать всё, что нужно; вкладка будет держаться
  // например, выключить автоспящий режим:
  await page.evaluate(() => setInterval(() => {}, 1 << 30));
});

// когда захочешь закрыть:
await hold.stop();
