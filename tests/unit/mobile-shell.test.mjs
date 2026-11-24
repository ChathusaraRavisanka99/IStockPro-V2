// Guards the mobile chrome: every page is reachable from the phone menus, and the theme switch
// (Light / Dark / System) is visible on phones in both the Full and the Lite version.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const read = (path) => readFileSync(path, "utf8");
const navSource = read("src/lib/navigation.ts");
const navHrefs = new Set(Array.from(navSource.matchAll(/href:\s*"([^"]+)"/g), (match) => match[1]));

// Top-level pages under src/app/(app) that intentionally aren't menu entries.
const NOT_IN_MENU = new Set(["lite"]);

test("every top-level page is in the navigation (desktop sidebar, phone drawer and Lite 'More')", () => {
  const appDir = "src/app/(app)";
  const pages = readdirSync(appDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("(") && !entry.name.startsWith("["))
    .filter((entry) => existsSync(join(appDir, entry.name, "page.tsx")))
    .map((entry) => entry.name)
    .filter((name) => !NOT_IN_MENU.has(name));
  const missing = pages.filter((name) => !navHrefs.has(`/${name}`));
  assert.deepEqual(missing, [], `Add these pages to src/lib/navigation.ts (or to NOT_IN_MENU here): ${missing.join(", ")}`);
});

test("the phone drawer and Lite 'More' sheet are built from the shared navigation list", () => {
  assert.match(read("src/components/ui/app-nav.tsx"), /navItems/);
  assert.match(read("src/components/ui/mobile-nav.tsx"), /<AppNav\b/);
  assert.match(read("src/components/ui/lite-shell.tsx"), /navItems/);
});

test("the theme switch is in the phone top bar of both versions, not only deep in a menu", () => {
  const mobileNav = read("src/components/ui/mobile-nav.tsx");
  const liteShell = read("src/components/ui/lite-shell.tsx");
  assert.match(mobileNav, /<ThemeToggle\b/, "Full version phone top bar must render <ThemeToggle>");
  assert.match(liteShell, /<ThemeToggle\b/, "Lite top bar must render <ThemeToggle>");
  // The labelled version (Light / Dark / System + help) lives with the account controls.
  assert.match(read("src/components/ui/logout-button.tsx"), /<ThemeToggle\b/);
});

test("the theme switch offers Light, Dark and System", () => {
  const toggle = read("src/components/ui/theme-toggle.tsx");
  for (const option of ['"light"', '"dark"', '"system"']) assert.ok(toggle.includes(`id: ${option}`), `missing ${option}`);
});

test("Back navigation and table sorting are mounted in both shells", () => {
  const layout = read("src/app/(app)/layout.tsx");
  assert.equal((layout.match(/<BackNav\b/g) ?? []).length, 2, "BackNav in Full and Lite");
  assert.equal((layout.match(/<TableSorter\b/g) ?? []).length, 2, "TableSorter in Full and Lite");
});

test("the UI test harness is disabled in production", () => {
  assert.match(read("src/app/ui-test/layout.tsx"), /process\.env\.UI_TEST !== "1"\) notFound\(\)/);
});
