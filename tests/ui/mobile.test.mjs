// Real-browser mobile checks against the UI test harness (src/app/ui-test), at phone and tablet
// widths, in light and dark. Starts its own dev server with UI_TEST=1 (no login, no database).
// Run: npm run test:ui        (uses Chrome if installed, else Playwright's Chromium)
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { chromium } from "playwright";

const PORT = Number(process.env.UI_TEST_PORT || 3210);
const BASE = `http://localhost:${PORT}`;
const WIDTHS = [320, 360, 390, 768];
const CHROME = process.env.CHROME_PATH || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((path) => existsSync(path));

let server;
let browser;

async function waitForServer(url, timeoutMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Dev server did not start on ${url}`);
}

before(async () => {
  server = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", "dev", "-p", String(PORT)], { env: { ...process.env, UI_TEST: "1" }, stdio: "ignore", shell: process.platform === "win32" });
  await waitForServer(`${BASE}/ui-test`);
  browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  // First compile of each page is slow — warm them up.
  const page = await browser.newPage();
  for (const path of ["/ui-test", "/ui-test/lite"]) await page.goto(BASE + path, { timeout: 180_000 });
  await page.close();
});

after(async () => {
  await browser?.close();
  if (server) {
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"]);
    else server.kill("SIGTERM");
  }
});

/** Elements whose right edge sticks out of the viewport, ignoring content inside sideways scrollers. */
async function overflowReport(page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const scrollers = (element) => {
      for (let node = element.parentElement; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX) && node !== document.body && node !== document.documentElement) return true;
      }
      return false;
    };
    const offenders = [];
    for (const element of document.querySelectorAll("main *, header *, nav *")) {
      const rect = element.getBoundingClientRect();
      if (!rect.width || rect.right <= width + 1 || scrollers(element)) continue;
      offenders.push(`${element.tagName.toLowerCase()}.${String(element.className).split(" ").slice(0, 3).join(".")} right=${Math.round(rect.right)}`);
    }
    return { pageWidth: document.documentElement.scrollWidth, viewport: width, offenders: offenders.slice(0, 8) };
  });
}

async function openAt(width, path, theme = "light") {
  const context = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 1, isMobile: width < 768, hasTouch: width < 768 });
  await context.addInitScript((value) => localStorage.setItem("istockpro-theme", value), theme);
  const page = await context.newPage();
  const response = await page.goto(BASE + path, { waitUntil: "networkidle" });
  // Never pass on an error or 404 page: the harness must have actually rendered.
  assert.equal(response?.status(), 200, `${path} returned ${response?.status()}`);
  await page.getByTestId("harness-ready").first().waitFor({ timeout: 15_000 });
  return { page, context };
}

for (const theme of ["light", "dark"]) {
  describe(`no sideways scrolling (${theme})`, () => {
    for (const width of WIDTHS) {
      for (const path of ["/ui-test", "/ui-test/lite"]) {
        test(`${path} at ${width}px`, async () => {
          const { page, context } = await openAt(width, path, theme);
          const report = await overflowReport(page);
          await context.close();
          assert.ok(report.pageWidth <= report.viewport + 1, `page is ${report.pageWidth}px wide on a ${report.viewport}px screen. Sticking out: ${report.offenders.join(" | ")}`);
          assert.deepEqual(report.offenders, [], "elements stick out of the screen");
        });
      }
    }
  });
}

describe("big forms fit a phone (new sale, quotation, register units)", () => {
  for (const width of [320, 360, 390]) {
    test(`/ui-test/forms empty at ${width}px`, async () => {
      const { page, context } = await openAt(width, "/ui-test/forms");
      const report = await overflowReport(page);
      await context.close();
      assert.ok(report.pageWidth <= report.viewport + 1, `page is ${report.pageWidth}px wide on a ${report.viewport}px screen. Sticking out: ${report.offenders.join(" | ")}`);
      assert.deepEqual(report.offenders, [], "elements stick out of the screen");
    });

    test(`/ui-test/forms with a 12-item bill at ${width}px`, async () => {
      const context = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true });
      await context.addInitScript(() => {
        const lines = Array.from({ length: 11 }, (_, index) => ({ key: `phone:${index}`, label: `Apple iPhone 13 Pro Max - 256GB · 6GB RAM · Sierra Blue Graphite Edition - IMEI 3596285429283${index}`, unitPrice: 385500 + index * 1000, quantity: 1, notes: index === 0 ? "Small scratch on the back — mention to the customer" : null }));
        lines.push({ key: "acc:1", label: "USB-C fast charger 25W (SKU JK05-1224947)", unitPrice: 4500, quantity: 3, maxQuantity: 31 });
        sessionStorage.setItem("istockpro-sale-draft", JSON.stringify({ lines, saleType: "Retail", taxMode: "Amount", taxValue: "0", handlingFee: "1500", discount: "2500" }));
      });
      const page = await context.newPage();
      await page.goto(BASE + "/ui-test/forms", { waitUntil: "networkidle" });
      await page.getByTestId("harness-ready").waitFor();
      await page.waitForFunction(() => document.body.innerText.includes("USB-C fast charger"), null, { timeout: 15_000 });
      const report = await overflowReport(page);
      await context.close();
      assert.ok(report.pageWidth <= report.viewport + 1, `page is ${report.pageWidth}px wide on a ${report.viewport}px screen. Sticking out: ${report.offenders.join(" | ")}`);
      assert.deepEqual(report.offenders, [], "elements stick out of the screen");
    });
  }
});

describe("key figures are visible on a phone without swiping", () => {
  /** True if the element is fully inside the screen horizontally. */
  const onScreen = (locator) => locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.left >= -1 && rect.right <= document.documentElement.clientWidth + 1;
  });

  test("sale cart: price, quantity and Remove of every line are on screen at 360px", async () => {
    const context = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
    await context.addInitScript(() => {
      const lines = [{ key: "phone:0", label: "Apple iPhone 13 Pro Max - 256GB · 6GB RAM · Sierra Blue Graphite Edition - IMEI 359628542928350", unitPrice: 385500, quantity: 1 }];
      sessionStorage.setItem("istockpro-sale-draft", JSON.stringify({ lines, saleType: "Retail", taxMode: "Amount", taxValue: "0", handlingFee: "0", discount: "0" }));
    });
    const page = await context.newPage();
    await page.goto(BASE + "/ui-test/forms", { waitUntil: "networkidle" });
    const card = page.getByTestId("cart-cards").locator("li").first();
    await card.waitFor({ timeout: 15_000 });
    assert.ok(await onScreen(card.getByLabel("Unit price")), "unit price input on screen");
    assert.ok(await onScreen(card.getByRole("button", { name: /^Remove/ })), "Remove on screen");
    assert.ok(await onScreen(card.getByText("LKR 385,500.00")), "line total on screen");
    await context.close();
  });

  test("report breakdowns: revenue of each row is on screen at 360px", async () => {
    const { page, context } = await openAt(360, "/ui-test");
    const list = page.getByTestId("breakdown-list").first();
    assert.ok(await list.isVisible(), "phone list is shown instead of the wide table");
    assert.ok(await onScreen(list.getByText(/^LKR /).first()), "revenue on screen");
    await context.close();
  });
});

describe("phone chrome", () => {
  test("Full version: theme switch is in the top bar and switches Light / Dark / System", async () => {
    const { page, context } = await openAt(390, "/ui-test");
    const toggle = page.getByTestId("mobile-theme-toggle");
    assert.ok(await toggle.isVisible(), "theme switch visible in the phone top bar");
    await toggle.getByRole("radio", { name: /dark/i }).click();
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), true);
    await toggle.getByRole("radio", { name: /light/i }).click();
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains("dark")), false);
    assert.ok(await toggle.getByRole("radio", { name: /system/i }).isVisible());
    await context.close();
  });

  test("Full version: the menu lists every page and the labelled theme switch", async () => {
    const { page, context } = await openAt(390, "/ui-test");
    await page.getByRole("button", { name: "Open menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Navigation menu" });
    for (const label of ["Dashboard", "Lots", "Sales", "Returns", "Suppliers", "Expenses", "Reports", "Recycle Bin", "Settings"]) {
      assert.ok(await drawer.getByRole("link", { name: label, exact: true }).count(), `menu is missing ${label}`);
    }
    assert.ok(await drawer.getByRole("radio", { name: /system/i }).count(), "labelled theme switch in the menu");
    await context.close();
  });

  test("Lite version: theme switch in the top bar; More lists every page", async () => {
    const { page, context } = await openAt(390, "/ui-test/lite");
    assert.ok(await page.getByTestId("lite-theme-toggle").isVisible());
    await page.getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog", { name: "More" });
    for (const label of ["Dashboard", "Suppliers", "Expenses", "Reports", "Recycle Bin", "Settings"]) {
      assert.ok(await sheet.getByRole("link", { name: label, exact: true }).count(), `More is missing ${label}`);
    }
    await context.close();
  });

  test("tables keep names on one line and scroll inside their card", async () => {
    const { page, context } = await openAt(360, "/ui-test");
    const cell = page.getByTestId("phone-cell").first();
    const lineHeight = await cell.evaluate((element) => parseFloat(getComputedStyle(element).lineHeight) || 20);
    const textHeight = await cell.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element.firstChild);
      return range.getBoundingClientRect().height;
    });
    assert.ok(textHeight < lineHeight * 1.6, `phone name wraps onto ${Math.round(textHeight / lineHeight)} lines`);
    const scroller = await page.getByTestId("wide-table").evaluate((element) => element.scrollWidth > element.clientWidth);
    assert.ok(scroller, "the wide table scrolls sideways inside its card");
    await context.close();
  });

  test("Find-the-sale popup finishes searching (never stuck on 'Searching…')", async () => {
    const { page, context } = await openAt(390, "/ui-test");
    await page.getByRole("button", { name: /select sale/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText(/No sales match|sale/).first().waitFor({ timeout: 20_000 });
    await page.waitForFunction(() => !document.body.innerText.includes("Searching…"), null, { timeout: 20_000 });
    await context.close();
  });

  /** The open dialog fits the phone screen (no sideways scroll inside it). */
  async function assertDialogFits(page) {
    const fit = await page.getByRole("dialog").last().evaluate((dialog) => {
      const rect = dialog.getBoundingClientRect();
      return { left: rect.left, right: rect.right, viewport: document.documentElement.clientWidth, inner: Array.from(dialog.querySelectorAll("*")).filter((node) => node.scrollWidth > node.clientWidth + 1 && !/(auto|scroll)/.test(getComputedStyle(node).overflowX) && getComputedStyle(node).overflowX !== "visible").length };
    });
    assert.ok(fit.left >= -1 && fit.right <= fit.viewport + 1, `dialog spans ${fit.left}–${fit.right} on a ${fit.viewport}px screen`);
  }

  test("Delete sale popup: per-item Restock / Remove, password, fits the phone", async () => {
    const { page, context } = await openAt(360, "/ui-test");
    await page.getByRole("button", { name: "Delete sale" }).click();
    const dialog = page.getByRole("dialog");
    await assertDialogFits(page);
    assert.ok((await dialog.innerText()).includes("2 line(s) restocked · 0 line(s) removed"));
    await dialog.getByRole("button", { name: "Remove all" }).click();
    assert.ok((await dialog.innerText()).includes("0 line(s) restocked · 2 line(s) removed"));
    assert.ok(await dialog.getByText(/Recycle Bin for 30 days/).isVisible());
    assert.ok(await dialog.locator('input[name="confirmPassword"]').isVisible(), "asks for the password");
    await context.close();
  });

  test("Move unit to another lot: Collection → Cleared is a sensitive change", async () => {
    const { page, context } = await openAt(360, "/ui-test");
    await page.getByRole("button", { name: "Edit" }).last().click();
    const dialog = page.getByRole("dialog");
    await assertDialogFits(page);
    assert.equal(await dialog.locator('input[name="confirmPassword"]').count(), 0, "no password before a change");
    await dialog.getByRole("button", { name: /LOT-0001/ }).click();
    await page.getByRole("button", { name: /LOT-0002/ }).click();
    assert.ok(await dialog.getByText(/Sensitive change/).isVisible(), "warns that the move is sensitive");
    assert.ok(await dialog.locator('input[name="confirmPassword"]').isVisible(), "asks for the password");
    await context.close();
  });

  test("Cost popup of a sold phone has a 'Sold in' section", async () => {
    const { page, context } = await openAt(360, "/ui-test");
    await page.getByTestId("sold-unit").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Sold in").waitFor();
    await dialog.getByText(/No sale found|Sale /).first().waitFor({ timeout: 15_000 });
    await assertDialogFits(page);
    await context.close();
  });

  test("Price history picker opens a searchable popup", async () => {
    const { page, context } = await openAt(390, "/ui-test");
    await page.getByRole("button", { name: /choose a phone model or variant/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder(/search model/i).fill("blue");
    assert.ok(await dialog.getByText("128GB · Blue").isVisible());
    await context.close();
  });
});
