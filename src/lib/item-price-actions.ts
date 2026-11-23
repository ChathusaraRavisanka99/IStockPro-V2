"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewCost } from "@/lib/rbac";
import { checkReauth } from "@/lib/reauth";
import { priceChangeLogs } from "@/lib/price-history";
import { auditChange, diffFields } from "@/lib/entity-guard";
import { logAppError } from "@/lib/error-log";

export type PriceEditResult = { ok: true; retailPrice: number; wholesalePrice: number; notes: string | null } | { ok: false; error: string; field?: "retailPrice" | "wholesalePrice" | "password" };

const MAX_PRICE = 100_000_000;

/** Shared validation (also mirrored in the popup so problems show before saving). */
function validate(retail: number, wholesale: number): PriceEditResult | null {
  if (!Number.isFinite(retail) || retail <= 0) return { ok: false, field: "retailPrice", error: "Enter a retail price greater than 0." };
  if (retail > MAX_PRICE) return { ok: false, field: "retailPrice", error: "That retail price looks too large — check the number of zeros." };
  if (!Number.isFinite(wholesale) || wholesale < 0) return { ok: false, field: "wholesalePrice", error: "Wholesale price can't be negative (use 0 if there is no wholesale price)." };
  if (wholesale > retail) return { ok: false, field: "wholesalePrice", error: "Wholesale price can't be higher than the retail price." };
  return null;
}

/**
 * Sets the retail/wholesale price (and notes) of a phone unit or accessory from the sale popup.
 * Same rules as everywhere else: managers only; a phone in a lot past Collection and any
 * accessory price change need the password; phone price changes go to the price history.
 */
export async function updateItemPricesAction(input: {
  kind: "phone" | "accessory";
  id: string;
  retailPrice: number;
  wholesalePrice: number;
  notes?: string | null;
  confirmUsername?: string;
  confirmPassword?: string;
}): Promise<PriceEditResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.error) return { ok: false, error: "Sign in again." };
  if (!canViewCost(session.user.role as "admin" | "manager" | "staff")) return { ok: false, error: "Only admins and managers can set prices — ask a manager." };

  const retail = Math.round(Number(input.retailPrice) * 100) / 100;
  const wholesale = Math.round(Number(input.wholesalePrice) * 100) / 100;
  const invalid = validate(retail, wholesale);
  if (invalid) return invalid;
  const notes = input.notes === undefined ? undefined : String(input.notes ?? "").trim().slice(0, 500) || null;

  const reauthForm = () => {
    const form = new FormData();
    form.set("confirmUsername", input.confirmUsername ?? "");
    form.set("confirmPassword", input.confirmPassword ?? "");
    return form;
  };

  try {
    if (input.kind === "phone") {
      const phone = await prisma.phone.findUnique({ where: { id: input.id }, select: { id: true, deletedAt: true, status: true, retailPrice: true, wholesalePrice: true, notes: true, lotId: true, lot: { select: { status: true } } } });
      if (!phone || phone.deletedAt) return { ok: false, error: "This phone no longer exists." };
      if (phone.status !== "InStock" && phone.status !== "Reserved") return { ok: false, error: `This phone is ${phone.status} — prices can only be set on stock that can be sold.` };
      const changes = diffFields({ retailPrice: phone.retailPrice, wholesalePrice: phone.wholesalePrice }, { retailPrice: retail, wholesalePrice: wholesale });
      if (changes.length && phone.lot.status !== "Collection") {
        const check = await checkReauth(reauthForm());
        if (!check.ok) return { ok: false, field: "password", error: check.error };
      }
      const logs = changes.length ? priceChangeLogs(phone.id, session.user.id, phone, { retailPrice: retail, wholesalePrice: wholesale }) : [];
      await prisma.$transaction([
        prisma.phone.update({ where: { id: phone.id }, data: { retailPrice: retail, wholesalePrice: wholesale, ...(notes !== undefined ? { notes } : {}) } }),
        ...(logs.length ? [prisma.auditLog.createMany({ data: logs })] : []),
      ]);
      revalidatePath("/items/phones");
      revalidatePath(`/lots/${phone.lotId}`);
      revalidatePath("/items/phones/price-history");
      return { ok: true, retailPrice: retail, wholesalePrice: wholesale, notes: notes === undefined ? phone.notes : notes };
    }

    const item = await prisma.accessory.findUnique({ where: { id: input.id } });
    if (!item || item.deletedAt) return { ok: false, error: "This item no longer exists." };
    const changes = diffFields({ retailPrice: item.retailPrice, wholesalePrice: item.wholesalePrice }, { retailPrice: retail, wholesalePrice: wholesale });
    if (changes.length) {
      const check = await checkReauth(reauthForm());
      if (!check.ok) return { ok: false, field: "password", error: check.error };
    }
    await prisma.accessory.update({ where: { id: item.id }, data: { retailPrice: retail, wholesalePrice: wholesale, ...(notes !== undefined ? { notes } : {}) } });
    if (changes.length) await auditChange("SensitiveEdit", "Accessory", item.id, session.user.id, { changes, from: "sale popup" });
    for (const path of ["/items/chargers", "/items/cables", "/items/handsfree", "/items/other"]) revalidatePath(path);
    return { ok: true, retailPrice: retail, wholesalePrice: wholesale, notes: notes === undefined ? item.notes : notes };
  } catch (error) {
    const ref = await logAppError("server-action", { where: "sales popup: updateItemPrices", error, extra: { kind: input.kind, id: input.id, retail, wholesale } }, session.user.id);
    return { ok: false, error: `Couldn't save the prices${ref ? ` (error ref ${ref})` : ""}.` };
  }
}
