#!/usr/bin/env node
/**
 * Static responsiveness checks for the app's TSX. Catches the layout patterns that overflow on
 * phones (390px) before they ship:
 *
 *  1. table-scroll      every <table> must sit inside an `overflow-x-auto` (or `overflow-auto`)
 *                       container, or DataTableShell (which provides one).
 *  2. fixed-grid        `grid-cols-N` (N >= 3) must have a smaller base or a responsive prefix,
 *                       e.g. `grid-cols-1 md:grid-cols-3` — not a bare `grid-cols-4`.
 *  3. wide-fixed        fixed widths over 360px (`w-[480px]`, `min-w-[600px]`, `w-96`...) need a
 *                       responsive prefix or a `max-w-` cap.
 *  4. nowrap-row        a `flex` row holding buttons (`btn`) must be able to wrap (`flex-wrap`)
 *                       or scroll — long button rows are the most common overflow.
 *
 * Usage: node scripts/check-responsive.mjs           (exit 1 on findings)
 *        node scripts/check-responsive.mjs --list    (print every finding)
 * Suppress a reviewed line with a trailing comment: {/* responsive-ok: reason *\/} or // responsive-ok
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SRC = join(ROOT, "src");
const IGNORE_DIRS = new Set(["node_modules", ".next", "zz-mobile-preview"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (IGNORE_DIRS.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith(".tsx")) out.push(path);
  }
  return out;
}

const RESPONSIVE = /(?:^|\s)(?:sm|md|lg|xl|2xl):/;

function classStrings(line) {
  const found = [];
  for (const match of line.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{clsx\(([^)]*)\)\})/g)) found.push(match[1] ?? match[2] ?? match[3] ?? "");
  return found;
}

export function checkSource(source, file = "file.tsx") {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const findings = [];
  const add = (index, rule, message) => {
    if (/responsive-ok/.test(lines[index]) || (index > 0 && /responsive-ok/.test(lines[index - 1]))) return;
    findings.push({ file, line: index + 1, rule, message });
  };

  lines.forEach((line, index) => {
    // 1. tables need a horizontal scroller around them
    if (/<table[\s>]/.test(line)) {
      const before = lines.slice(Math.max(0, index - 12), index + 1).join("\n");
      const wrapped = /overflow-x-auto|overflow-auto|overflow-x-scroll/.test(before) || /<DataTableShell/.test(before);
      if (!wrapped) add(index, "table-scroll", "<table> without an overflow-x-auto wrapper — wide tables push the page sideways on phones");
    }
    for (const cls of classStrings(line)) {
      // 2. bare multi-column grids
      for (const match of cls.matchAll(/(?:^|\s)grid-cols-(\d+)(?=\s|$)/g)) {
        const cols = Number(match[1]);
        if (cols >= 3) {
          add(index, "fixed-grid", `grid-cols-${cols} without a phone-sized base (use grid-cols-1/2 and a sm:/md: prefix)`);
        }
      }
      // 3. very wide fixed widths
      for (const match of cls.matchAll(/(?:^|\s)((?:min-)?w-\[(\d+)px\]|(?:min-)?w-(96|\[\d+(?:\.\d+)?rem\]))(?=\s|$)/g)) {
        const rem = match[1].match(/\[(\d+(?:\.\d+)?)rem\]/);
        const px = match[2] ? Number(match[2]) : match[3] === "96" ? 384 : rem ? Number(rem[1]) * 16 : 0;
        if (px > 360 && !/max-w-/.test(cls)) add(index, "wide-fixed", `${match[1]} is wider than a phone without a max-w cap or responsive prefix`);
      }
      // 4. button rows that cannot wrap
      if (/(?:^|\s)flex(?=\s|$)/.test(cls) && !/flex-col|flex-wrap|overflow-x-auto|grid/.test(cls) && /gap-/.test(cls)) {
        // Only look at this element's own children: stop at the closing tag at the same indent.
        const indent = line.match(/^\s*/)[0].length;
        // Group the lines into direct children (a child starts at indent + 2 with "<" or "{").
        const children = [];
        for (let next = index + 1; next < lines.length && next < index + 60; next++) {
          const nextIndent = lines[next].match(/^\s*/)[0].length;
          if (nextIndent <= indent) break;
          if (nextIndent === indent + 2 && /^\s*[<{]/.test(lines[next]) && !/^\s*<\//.test(lines[next])) children.push([lines[next]]);
          else if (children.length) children[children.length - 1].push(lines[next]);
        }
        const isButton = (chunk) => {
          const head = chunk.slice(0, 4).join(" ");
          return /<[A-Z]\w*Button\b/.test(head) || /<(?:button|Link|a)\b[^]*?\bbtn\s/.test(head);
        };
        const buttons = children.filter(isButton).length;
        if (buttons >= 3) add(index, "nowrap-row", `flex row with ${buttons} buttons and no flex-wrap — wraps off-screen on phones`);
      }
    }
  });
  return findings;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/").replace(/^([A-Za-z]:)/, "/$1")}` || process.argv[1]?.endsWith("check-responsive.mjs")) {
  const all = walk(SRC).flatMap((file) => checkSource(readFileSync(file, "utf8"), relative(ROOT, file).replace(/\\/g, "/")));
  const byRule = all.reduce((acc, finding) => ((acc[finding.rule] = (acc[finding.rule] ?? 0) + 1), acc), {});
  if (process.argv.includes("--list") || all.length) for (const finding of all) console.log(`${finding.file}:${finding.line}  [${finding.rule}] ${finding.message}`);
  console.log(all.length ? `\n${all.length} responsive issue(s): ${JSON.stringify(byRule)}` : "✓ No responsive issues found");
  process.exit(all.length ? 1 : 0);
}
