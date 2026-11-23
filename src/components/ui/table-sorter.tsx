"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Makes every table in the app sortable by clicking its column headers — no per-table code.
 *
 * Click: ascending → descending → original order. Values are compared smartly: money
 * ("LKR 1,234.00"), numbers, percentages, dates (YYYY-MM-DD…) and IMEIs numerically; text with
 * natural ordering ("iPhone 9" < "iPhone 11"). A cell can override its sort value with
 * data-sort="…"; a table opts out with data-no-sort, a header with data-no-sort.
 * Rows that span the whole table ("No results…") stay at the bottom. Sorting is re-applied when
 * the rows re-render (e.g. after an edit refreshes the page).
 */

type SortState = { column: number; direction: "asc" | "desc" };
const STATE = new WeakMap<HTMLTableElement, SortState>();
const ORIGINAL = new WeakMap<HTMLTableSectionElement, HTMLTableRowElement[]>();
let applying = false;

const SKIP_HEADERS = /^(actions?|view|open|)$/i;

function cellValue(cell: Element | undefined): { num: number | null; text: string } {
  if (!cell) return { num: null, text: "" };
  const raw = (cell as HTMLElement).dataset.sort ?? (cell as HTMLElement).innerText ?? cell.textContent ?? "";
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text || text === "-" || text === "—") return { num: null, text: "" };
  // Dates: 2026-11-22 or 2026-11-22 08:23
  const date = text.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/);
  if (date) return { num: Date.parse(`${date[1]}T${date[2] ?? "00:00"}:00`), text };
  // Money / numbers / percentages, possibly with a sign or arrow ("+LKR 1,000.00 (+5.0%)")
  const money = text.match(/^[▲▼+\-−]?\s*(?:LKR|Rs\.?|\$)?\s*([+\-−]?[\d,]+(?:\.\d+)?)\s*%?/i);
  if (money) {
    const negative = /^[▼\-−]/.test(text) || money[1].startsWith("-") || money[1].startsWith("−");
    const value = Number(money[1].replace(/[,+\-−]/g, ""));
    if (Number.isFinite(value)) return { num: negative ? -value : value, text };
  }
  return { num: null, text: text.toLowerCase() };
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function dataRows(body: HTMLTableSectionElement) {
  return Array.from(body.rows);
}

function isFullWidth(row: HTMLTableRowElement, columns: number) {
  return row.cells.length === 1 && row.cells[0].colSpan >= Math.max(2, columns - 1);
}

function applySort(table: HTMLTableElement) {
  const body = table.tBodies[0];
  if (!body) return;
  const state = STATE.get(table);
  const columns = table.tHead?.rows[0]?.cells.length ?? 0;
  if (!ORIGINAL.has(body)) ORIGINAL.set(body, dataRows(body));
  const original = ORIGINAL.get(body)!.filter((row) => row.parentElement === body);
  const current = dataRows(body);
  // Rows added by a re-render that we haven't seen yet keep their DOM position as "original".
  const known = new Set(original);
  const all = [...original, ...current.filter((row) => !known.has(row))];
  ORIGINAL.set(body, all);

  const fullWidth = all.filter((row) => isFullWidth(row, columns));
  const sortable = all.filter((row) => !isFullWidth(row, columns));
  let ordered = sortable;
  if (state) {
    ordered = [...sortable].sort((a, b) => {
      const left = cellValue(a.cells[state.column]);
      const right = cellValue(b.cells[state.column]);
      // Empty values always last.
      if (!left.text && !right.text) return 0;
      if (!left.text) return 1;
      if (!right.text) return -1;
      const result = left.num !== null && right.num !== null ? left.num - right.num : collator.compare(left.text, right.text);
      return state.direction === "asc" ? result : -result;
    });
  }
  // Only touch the DOM when the order actually changes — re-applying an already-applied sort is
  // a no-op, so the row observer below can't trigger itself in a loop.
  const target = [...ordered, ...fullWidth];
  const live = dataRows(body);
  if (target.length === live.length && target.every((row, index) => row === live[index])) return;
  applying = true;
  for (const row of target) body.appendChild(row);
  applying = false;
}

function updateIndicators(table: HTMLTableElement) {
  const state = STATE.get(table);
  const headers = table.tHead?.rows[0]?.cells;
  if (!headers) return;
  Array.from(headers).forEach((header, index) => {
    const indicator = header.querySelector<HTMLElement>("[data-sort-indicator]");
    if (!indicator) return;
    const active = state?.column === index;
    header.setAttribute("aria-sort", active ? (state!.direction === "asc" ? "ascending" : "descending") : "none");
    indicator.textContent = active ? (state!.direction === "asc" ? "▲" : "▼") : "↕";
    indicator.style.opacity = active ? "1" : "0.35";
  });
}

function enhance(table: HTMLTableElement) {
  if (table.dataset.sortReady || table.hasAttribute("data-no-sort")) return;
  const headerRow = table.tHead?.rows[0];
  const body = table.tBodies[0];
  if (!headerRow || !body) return;
  table.dataset.sortReady = "1";
  Array.from(headerRow.cells).forEach((header, index) => {
    const label = (header.textContent ?? "").trim();
    if (header.hasAttribute("data-no-sort") || SKIP_HEADERS.test(label) || header.colSpan > 1) return;
    header.style.cursor = "pointer";
    header.style.userSelect = "none";
    header.tabIndex = 0;
    header.title = `Sort by ${label}`;
    const indicator = document.createElement("span");
    indicator.dataset.sortIndicator = "";
    indicator.setAttribute("aria-hidden", "true");
    indicator.style.cssText = "margin-left:4px;font-size:9px;opacity:.35;display:inline-block;";
    indicator.textContent = "↕";
    header.appendChild(indicator);
    const toggle = () => {
      const state = STATE.get(table);
      if (!state || state.column !== index) STATE.set(table, { column: index, direction: "asc" });
      else if (state.direction === "asc") STATE.set(table, { column: index, direction: "desc" });
      else STATE.delete(table);
      applySort(table);
      updateIndicators(table);
    };
    header.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("button, a, input, select")) return;
      toggle();
    });
    header.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggle();
      }
    });
  });
  updateIndicators(table);
  // Re-apply the chosen sort when React re-renders the rows (e.g. after router.refresh()).
  new MutationObserver(() => {
    if (applying || !STATE.has(table)) return;
    applySort(table);
  }).observe(body, { childList: true });
}

export function TableSorter() {
  const pathname = usePathname();
  useEffect(() => {
    const scan = () => document.querySelectorAll<HTMLTableElement>("main table, [role=dialog] table").forEach(enhance);
    scan();
    const observer = new MutationObserver(() => scan());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);
  return null;
}
