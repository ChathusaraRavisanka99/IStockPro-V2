// Accepts plain numbers/strings as well as Prisma's Decimal type (and anything else
// coercible via Number()) so call sites never need to unwrap Decimal fields themselves.
export function formatMoney(value: unknown): string {
  const n = value === null || value === undefined ? 0 : Number(value);
  return `LKR ${(Number.isFinite(n) ? n : 0).toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Short axis label for charts: 2.6M, 650k, 450 — full amounts stay in tooltips and tables. */
export function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
}
