import { prisma } from "@/lib/prisma";
import { SOFT_DELETE_RETENTION_DAYS } from "@/lib/purge";

export type RecycleKind = "lot" | "phone" | "variant" | "model" | "customer" | "supplier" | "accessory";
type Result = { ok: true; message?: string } | { ok: false; error: string };

/** softDeleteLot() appends " [deleted <ms>]" to free the lot number; this strips it again. */
export function originalLotNumber(lotNumber: string) {
  return lotNumber.replace(/ \[deleted \d+\]$/, "");
}

export function retentionCutoff(now = new Date()) {
  return new Date(now.getTime() - SOFT_DELETE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

export function daysLeft(deletedAt: Date, now = new Date()) {
  const purgeAt = deletedAt.getTime() + SOFT_DELETE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((purgeAt - now.getTime()) / (24 * 60 * 60 * 1000)));
}

async function imeiTaken(imei: string, exceptId: string) {
  return Boolean(await prisma.phone.findFirst({ where: { imei, deletedAt: null, id: { not: exceptId } }, select: { id: true } }));
}

async function restorePhone(id: string): Promise<Result> {
  const phone = await prisma.phone.findUnique({ where: { id }, include: { lot: true, phoneVariant: { include: { phoneModel: true } } } });
  if (!phone?.deletedAt) return { ok: false, error: "Unit not found in the recycle bin." };
  if (phone.lot.deletedAt) return { ok: false, error: `Its lot ${originalLotNumber(phone.lot.lotNumber)} is deleted too — restore the lot first.` };
  if (phone.phoneVariant.deletedAt || phone.phoneVariant.phoneModel.deletedAt) return { ok: false, error: "Its variant/model is deleted — restore that first." };
  if (await imeiTaken(phone.imei, id)) return { ok: false, error: `IMEI ${phone.imei} has since been registered to another unit.` };
  await prisma.phone.update({ where: { id }, data: { deletedAt: null } });
  return { ok: true };
}

async function restoreLot(id: string): Promise<Result> {
  const lot = await prisma.lot.findUnique({ where: { id } });
  if (!lot?.deletedAt) return { ok: false, error: "Lot not found in the recycle bin." };
  const lotNumber = originalLotNumber(lot.lotNumber);
  if (lotNumber !== lot.lotNumber && (await prisma.lot.findUnique({ where: { lotNumber }, select: { id: true } }))) {
    return { ok: false, error: `Lot number ${lotNumber} is now used by another lot.` };
  }
  // Units archived together with the lot share its deletedAt timestamp.
  const units = await prisma.phone.findMany({ where: { lotId: id, deletedAt: lot.deletedAt }, select: { id: true, imei: true } });
  const blocked: string[] = [];
  const restorable: string[] = [];
  for (const unit of units) ((await imeiTaken(unit.imei, unit.id)) ? blocked : restorable).push(unit.id);
  await prisma.$transaction([
    prisma.lot.update({ where: { id }, data: { deletedAt: null, lotNumber } }),
    prisma.phone.updateMany({ where: { id: { in: restorable } }, data: { deletedAt: null } }),
  ]);
  return {
    ok: true,
    message: blocked.length
      ? `Lot restored with ${restorable.length} unit(s). ${blocked.length} unit(s) stayed deleted because their IMEI is now used by another unit.`
      : `Lot restored with ${restorable.length} unit(s).`,
  };
}

async function restoreVariant(id: string): Promise<Result> {
  const variant = await prisma.phoneVariant.findUnique({ where: { id }, include: { phoneModel: true } });
  if (!variant?.deletedAt) return { ok: false, error: "Variant not found in the recycle bin." };
  if (variant.phoneModel.deletedAt) return { ok: false, error: "Its model is deleted — restore the model first." };
  await prisma.phoneVariant.update({ where: { id }, data: { deletedAt: null } });
  return { ok: true };
}

export async function restoreItem(kind: RecycleKind, id: string): Promise<Result> {
  if (!id) return { ok: false, error: "Missing item." };
  switch (kind) {
    case "lot":
      return restoreLot(id);
    case "phone":
      return restorePhone(id);
    case "variant":
      return restoreVariant(id);
    case "model":
      await prisma.phoneModel.update({ where: { id }, data: { deletedAt: null } });
      return { ok: true };
    case "customer":
      await prisma.customer.update({ where: { id }, data: { deletedAt: null } });
      return { ok: true };
    case "supplier":
      await prisma.supplier.update({ where: { id }, data: { deletedAt: null } });
      return { ok: true };
    case "accessory":
      await prisma.accessory.update({ where: { id }, data: { deletedAt: null } });
      return { ok: true };
    default:
      return { ok: false, error: "Unknown item type." };
  }
}
