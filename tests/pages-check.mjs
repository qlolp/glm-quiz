import { chromium } from "playwright";
const browser = await chromium.launch();
const pages = [
  "/", "/register.html", "/cases.html", "/learning.html", "/rating.html",
  "/gamification.html", "/my-certificates.html", "/status.html",
  "/guide/user", "/guide/speaker", "/admin.html", "/realtime-host.html",
  "/realtime-player.html", "/spaced-repetition.html", "/analytics.html"
];
for (const p of pages) {
  const page = await browser.newPage();
  const resp = await page.goto("http://147.45.174.206" + p, { waitUntil: "networkidle" });
  const ok = resp && resp.status() < 500;
  const title = await page.title().catch(() => "");
  console.log((ok ? "OK" : "FAIL") + " " + p + " -> " + resp.status() + " " + title);
  await page.close();
}
await browser.close();
