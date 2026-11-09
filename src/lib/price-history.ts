import type { Prisma } from "@prisma/client";

export const PRICE_CHANGE_ACTION = "PhonePriceChange";

export type PriceField = "retailPrice" | "wholesalePrice";
export type PriceChangeDetails = { field: PriceField; oldPrice: number; newPrice: number };

export const PRICE_FIELD_LABELS: Record<PriceField, string> = { retailPrice: "Retail", wholesalePrice: "Wholesale" };

/**
 * Audit-log rows for a phone's retail/wholesale price edits — one row per field that
 * actually changed, so the Price History page can filter by field. Stored in AuditLog
 * (entityType "Phone") rather than a dedicated table so no migration is needed.
 */
export function priceChangeLogs(
  phoneId: string,
  userId: string | undefined,
  before: { retailPrice: unknown; wholesalePrice: unknown },
  after: { retailPrice: number; wholesalePrice: number }
): Prisma.AuditLogCreateManyInput[] {
  const rows: Prisma.AuditLogCreateManyInput[] = [];
  for (const field of ["retailPrice", "wholesalePrice"] as const) {
    const oldPrice = Number(before[field] ?? 0);
    const newPrice = after[field];
    if (Math.abs(oldPrice - newPrice) < 0.005) continue;
    const details: PriceChangeDetails = { field, oldPrice, newPrice };
    rows.push({ action: PRICE_CHANGE_ACTION, entityType: "Phone", entityId: phoneId, userId: userId || null, details });
  }
  return rows;
}
