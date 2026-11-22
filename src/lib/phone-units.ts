import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findImeiOwner } from "@/lib/imei";
import { checkReauth } from "@/lib/reauth";
import { priceChangeLogs } from "@/lib/price-history";

type Result = { ok: true } | { ok: false; error: string };

/** A variant a unit may be moved onto: it and its model must both be live. */
export async function validateTargetVariant(variantId: string): Promise<Result> {
  const variant = await prisma.phoneVariant.findUnique({ where: { id: variantId }, select: { deletedAt: true, phoneModel: { select: { deletedAt: true } } } });
  if (!variant || variant.deletedAt || variant.phoneModel.deletedAt) return { ok: false, error: "That variant no longer exists — pick another one." };
  return { ok: true };
}

/**
 * Saves the "Edit unit" form: variant (and so model), IMEI, grade/battery health (once the lot
 * is Cleared), notes, and — for roles that can see cost — prices. Same rules as the lot page:
 * IMEI unique among live units; price edits after the Collection stage need a password
 * re-confirm; every retail/wholesale change is written to the price history.
 */
export async function editPhoneUnit(formData: FormData, actor: { userId?: string; canEditCost: boolean }): Promise<Result> {
  const id = String(formData.get("id") || "");
  const phone = await prisma.phone.findUnique({
    where: { id },
    select: { id: true, imei: true, deletedAt: true, phoneVariantId: true, purchasePrice: true, wholesalePrice: true, retailPrice: true, tagCost: true, batteryCost: true, lot: { select: { status: true } } },
  });
  if (!phone || phone.deletedAt) return { ok: false, error: "Unit not found." };

  const data: Prisma.PhoneUncheckedUpdateInput = {};

  const imei = String(formData.get("imei") ?? phone.imei).trim();
  if (!imei) return { ok: false, error: "IMEI can't be empty." };
  if (imei !== phone.imei) {
    const owner = await findImeiOwner(imei, id);
    if (owner) return { ok: false, error: `IMEI ${imei} is already registered to ${owner.phone} in lot ${owner.lotNumber} (${owner.status}). An IMEI can only belong to one active phone.` };
    data.imei = imei;
  }

  const variantId = String(formData.get("phoneVariantId") || phone.phoneVariantId);
  if (variantId !== phone.phoneVariantId) {
    const check = await validateTargetVariant(variantId);
    if (!check.ok) return check;
    data.phoneVariantId = variantId;
  }

  if (formData.has("notes")) data.notes = String(formData.get("notes") || "").trim() || null;

  if (phone.lot.status === "Cleared" && formData.has("grade")) {
    const grade = String(formData.get("grade") || "");
    data.grade = (["A", "B", "C"].includes(grade) ? grade : null) as "A" | "B" | "C" | null;
    const battery = String(formData.get("batteryHealth") || "").trim();
    data.batteryHealth = battery ? Math.max(0, Math.min(100, Number(battery))) : null;
  }

  let priceLogs: Prisma.AuditLogCreateManyInput[] = [];
  if (actor.canEditCost && formData.has("purchasePrice")) {
    const prices = {
      purchasePrice: Number(formData.get("purchasePrice") || 0),
      wholesalePrice: Number(formData.get("wholesalePrice") || 0),
      retailPrice: Number(formData.get("retailPrice") || 0),
      tagCost: Number(formData.get("tagCost") || 0),
      batteryCost: Number(formData.get("batteryCost") || 0),
    };
    const changed = (Object.keys(prices) as (keyof typeof prices)[]).some((key) => Math.abs(Number(phone[key] ?? 0) - prices[key]) >= 0.005);
    if (changed) {
      if (phone.lot.status !== "Collection") {
        const check = await checkReauth(formData);
        if (!check.ok) return check;
      }
      Object.assign(data, prices);
      priceLogs = priceChangeLogs(id, actor.userId, phone, { retailPrice: prices.retailPrice, wholesalePrice: prices.wholesalePrice });
    }
  }

  if (!Object.keys(data).length) return { ok: true };
  await prisma.$transaction([prisma.phone.update({ where: { id }, data }), ...(priceLogs.length ? [prisma.auditLog.createMany({ data: priceLogs })] : [])]);
  return { ok: true };
}
