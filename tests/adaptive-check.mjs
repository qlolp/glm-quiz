import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("http://147.45.174.206/");
await page.waitForSelector("#welcome-screen", { timeout: 5000 });
const selectors = ["[data-mode=adaptive]", "button:has-text(\"Адаптивный\")", "button:has-text(\"Адаптив\")"];
let clicked = false;
for (const sel of selectors) {
  const btn = await page.$(sel);
  if (btn) {
    await btn.click();
    clicked = true;
    break;
  }
}
if (!clicked) {
  console.log("ADAPTIVE BUTTON NOT FOUND");
} else {
  await page.waitForTimeout(2500);
  const error = await page.$("text=\"Не удалось загрузить вопросы\"");
  console.log(error ? "ADAPTIVE ERROR" : "ADAPTIVE OK");
}
await browser.close();
