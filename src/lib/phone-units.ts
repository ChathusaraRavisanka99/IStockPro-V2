import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findImeiOwner } from "@/lib/imei";
import { checkReauth } from "@/lib/reauth";
import { priceChangeLogs } from "@/lib/price-history";
import { recomputeLotPayments } from "@/lib/lots";

/**
 * Moving a unit to another lot changes both lots' goods cost, what's owed to each supplier and
 * the unit's landed cost/profit. It's a sensitive change (password) unless both lots are still
 * in Collection and the unit hasn't been sold — nothing financial is settled yet then.
 */
export function lotMoveIsSensitive(fromStatus: string, toStatus: string, unitStatus: string) {
  return fromStatus !== "Collection" || toStatus !== "Collection" || unitStatus !== "InStock";
}

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
    select: { id: true, imei: true, status: true, deletedAt: true, lotId: true, phoneVariantId: true, purchasePrice: true, wholesalePrice: true, retailPrice: true, tagCost: true, batteryCost: true, lot: { select: { status: true, lotNumber: true } } },
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

  // Move to another lot (cost roles only).
  let reauthDone = false;
  let lotMove: { from: string; to: string; fromNumber: string; toNumber: string } | null = null;
  const lotId = String(formData.get("lotId") || phone.lotId);
  if (lotId !== phone.lotId) {
    if (!actor.canEditCost) return { ok: false, error: "Only admins and managers can move units between lots." };
    const target = await prisma.lot.findUnique({ where: { id: lotId }, select: { id: true, lotNumber: true, status: true, deletedAt: true } });
    if (!target || target.deletedAt) return { ok: false, error: "That lot no longer exists — pick another one." };
    if (lotMoveIsSensitive(phone.lot.status, target.status, phone.status)) {
      const check = await checkReauth(formData);
      if (!check.ok) return check;
      reauthDone = true;
    }
    data.lotId = lotId;
    lotMove = { from: phone.lotId, to: lotId, fromNumber: phone.lot.lotNumber, toNumber: target.lotNumber };
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
      if (phone.lot.status !== "Collection" && !reauthDone) {
        const check = await checkReauth(formData);
        if (!check.ok) return check;
      }
      Object.assign(data, prices);
      priceLogs = priceChangeLogs(id, actor.userId, phone, { retailPrice: prices.retailPrice, wholesalePrice: prices.wholesalePrice });
    }
  }

  if (!Object.keys(data).length) return { ok: true };
  await prisma.$transaction(async (tx) => {
    await tx.phone.update({ where: { id }, data });
    if (priceLogs.length) await tx.auditLog.createMany({ data: priceLogs });
    if (lotMove) {
      // Both lots' goods cost changed — recompute what's owed and the payment status.
      await recomputeLotPayments(lotMove.from, tx);
      await recomputeLotPayments(lotMove.to, tx);
      await tx.auditLog.create({
        data: { action: "SensitiveEdit", entityType: "Phone", entityId: id, userId: actor.userId ?? null, details: { field: "lot", imei: phone.imei, from: lotMove.fromNumber, to: lotMove.toNumber, fromLotId: lotMove.from, toLotId: lotMove.to } },
      });
    }
  });
  return { ok: true };
}
