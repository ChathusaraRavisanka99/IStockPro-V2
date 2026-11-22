import { prisma } from "@/lib/prisma";
import { checkReauth } from "@/lib/reauth";

/**
 * Server-side half of the "review sensitive changes" flow (client half:
 * src/components/ui/entity-editor.tsx). Non-sensitive edits apply directly; if any sensitive
 * field actually changed, the request must carry a valid password re-confirm. Every sensitive
 * edit/delete is written to the audit log with its before → after values.
 */

export type GuardResult = { ok: true } | { ok: false; error: string };

const normalize = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && "toString" in (value as object)) return String(value).trim();
  if (typeof value === "number") return String(Number(value.toFixed(4)));
  return String(value).trim();
};

const sameValue = (a: unknown, b: unknown) => {
  const left = normalize(a);
  const right = normalize(b);
  if (left === right) return true;
  const ln = Number(left);
  const rn = Number(right);
  return left !== "" && right !== "" && Number.isFinite(ln) && Number.isFinite(rn) && Math.abs(ln - rn) < 0.005;
};

/** Field-by-field before/after for the keys that actually changed. */
export function diffFields(before: Record<string, unknown>, after: Record<string, unknown>) {
  return Object.keys(after)
    .filter((key) => !sameValue(before[key], after[key]))
    .map((key) => ({ field: key, before: normalize(before[key]), after: normalize(after[key]) }));
}

/** Requires the password re-confirm only when `needed`. */
export async function requireReauthWhen(formData: FormData, needed: boolean): Promise<GuardResult> {
  if (!needed) return { ok: true };
  return checkReauth(formData);
}

export async function auditChange(
  action: "SensitiveEdit" | "SensitiveDelete" | "Delete",
  entityType: string,
  entityId: string,
  userId: string | undefined,
  details: Record<string, unknown>
) {
  await prisma.auditLog.create({ data: { action, entityType, entityId, userId: userId || null, details: details as object } });
}
