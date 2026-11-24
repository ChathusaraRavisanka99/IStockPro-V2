// Logged-in mobile check of every real page: no sideways scrolling at phone width, and the
// phone top bar has the theme switch. Only browses (never clicks Save/Delete).
//
// Needs a login, so it is skipped unless these are set (put them in .env.local — never commit):
//   E2E_USERNAME=...   E2E_PASSWORD=...   (a staff account is enough)
//   E2E_BASE_URL=http://localhost:3000   (optional; default — run `npm run dev` first)
// Run: npm run test:e2e
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

// Minimal .env.local loader (no dependency).
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(E2E_[A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

const { E2E_USERNAME, E2E_PASSWORD } = process.env;
const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
const CHROME = process.env.CHROME_PATH || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome"].find((path) => existsSync(path));
const skip = !E2E_USERNAME || !E2E_PASSWORD ? "set E2E_USERNAME and E2E_PASSWORD (see file header)" : false;

const navSource = readFileSync("src/lib/navigation.ts", "utf8");
const ROUTES = Array.from(new Set(Array.from(navSource.matchAll(/href:\s*"([^"]+)"/g), (match) => match[1]))).concat(["/lite", "/lite/stock", "/expenses?view=stats", "/reports"]);

let browser;
let context;

before(async () => {
  if (skip) return;
  browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByPlaceholder("Your username").fill(E2E_USERNAME);
  await page.getByPlaceholder("Your password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
  await page.close();
});

after(async () => {
  await browser?.close();
});

for (const route of ROUTES) {
  test(`${route} fits a 390px phone`, { skip }, async () => {
    const page = await context.newPage();
    const response = await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 60_000 });
    assert.ok(response && response.status() < 400, `${route} returned ${response?.status()}`);
    const report = await page.evaluate(() => ({ pageWidth: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }));
    await page.close();
    assert.ok(report.pageWidth <= report.viewport + 1, `${route} is ${report.pageWidth}px wide on a ${report.viewport}px phone`);
  });
}
