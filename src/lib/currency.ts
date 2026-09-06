// Accepts plain numbers/strings as well as Prisma's Decimal type (and anything else
// coercible via Number()) so call sites never need to unwrap Decimal fields themselves.
export function formatMoney(value: unknown): string {
  const n = value === null || value === undefined ? 0 : Number(value);
  return `LKR ${(Number.isFinite(n) ? n : 0).toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
