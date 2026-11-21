import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SOFT_DELETE_RETENTION_DAYS } from "@/lib/purge";

export type RecycleKind = "lot" | "phone" | "variant" | "model" | "customer" | "supplier" | "accessory";

/**
 * A reason a restore can't (fully) go ahead. "block" stops the restore; "warn" lets it
 * proceed but explains what was left behind (e.g. lot units whose IMEI is now taken).
 * `href` links to the record causing the conflict so the user can resolve it.
 */
export type RestoreIssue = { level: "block" | "warn"; message: string; href?: string; linkLabel?: string };
export type RestoreResult = { ok: true; message?: string; issues?: RestoreIssue[] } | { ok: false; error: string; issues?: RestoreIssue[] };

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

/** Live units currently holding any of these IMEIs, keyed by IMEI. */
async function liveImeiHolders(imeis: string[], exceptIds: string[]) {
  if (!imeis.length) return new Map<string, { id: string; lotId: string; lotNumber: string }>();
  const holders = await prisma.phone.findMany({
    where: { imei: { in: imeis }, deletedAt: null, id: { notIn: exceptIds } },
    select: { id: true, imei: true, lotId: true, lot: { select: { lotNumber: true } } },
  });
  return new Map(holders.map((holder) => [holder.imei, { id: holder.id, lotId: holder.lotId, lotNumber: holder.lot.lotNumber }]));
}

function imeiIssue(level: RestoreIssue["level"], imei: string, holder: { lotId: string; lotNumber: string }): RestoreIssue {
  return {
    level,
    message: `IMEI ${imei} is already used by a live unit in lot ${holder.lotNumber} — only one active unit may have an IMEI.`,
    href: `/lots/${holder.lotId}`,
    linkLabel: `Open lot ${holder.lotNumber}`,
  };
}

/**
 * Every constraint the restore would hit, checked up front so the Recycle Bin can show
 * them next to the item before anyone clicks Restore — and re-checked by restoreItem().
 */
export async function checkRestore(kind: RecycleKind, id: string): Promise<RestoreIssue[]> {
  switch (kind) {
    case "phone": {
      const phone = await prisma.phone.findUnique({ where: { id }, include: { lot: true, phoneVariant: { include: { phoneModel: true } } } });
      if (!phone?.deletedAt) return [{ level: "block", message: "This unit is no longer in the recycle bin." }];
      const issues: RestoreIssue[] = [];
      if (phone.lot.deletedAt) issues.push({ level: "block", message: `Its lot ${originalLotNumber(phone.lot.lotNumber)} is deleted — restore the lot first (that also brings back the units deleted with it).` });
      if (phone.phoneVariant.phoneModel.deletedAt) issues.push({ level: "block", message: `Its model ${phone.phoneVariant.phoneModel.brand} ${phone.phoneVariant.phoneModel.modelName} is deleted — restore the model first.` });
      else if (phone.phoneVariant.deletedAt) issues.push({ level: "block", message: `Its variant "${phone.phoneVariant.variantName}" is deleted — restore the variant first.` });
      const holder = (await liveImeiHolders([phone.imei], [id])).get(phone.imei);
      if (holder) issues.push(imeiIssue("block", phone.imei, holder));
      return issues;
    }
    case "lot": {
      const lot = await prisma.lot.findUnique({ where: { id } });
      if (!lot?.deletedAt) return [{ level: "block", message: "This lot is no longer in the recycle bin." }];
      const issues: RestoreIssue[] = [];
      const lotNumber = originalLotNumber(lot.lotNumber);
      const clash = lotNumber !== lot.lotNumber ? await prisma.lot.findUnique({ where: { lotNumber }, select: { id: true, deletedAt: true } }) : null;
      if (clash) {
        issues.push({
          level: "block",
          message: `Lot number ${lotNumber} is now used by another lot — lot numbers must be unique. Rename that lot first.`,
          ...(clash.deletedAt ? {} : { href: `/lots/${clash.id}`, linkLabel: `Open lot ${lotNumber}` }),
        });
      }
      const units = await prisma.phone.findMany({ where: { lotId: id, deletedAt: lot.deletedAt }, select: { id: true, imei: true } });
      const holders = await liveImeiHolders(units.map((unit) => unit.imei), units.map((unit) => unit.id));
      for (const unit of units) {
        const holder = holders.get(unit.imei);
        if (holder) issues.push({ ...imeiIssue("warn", unit.imei, holder), message: `Unit ${unit.imei} will stay deleted: its IMEI is already used by a live unit in lot ${holder.lotNumber}.` });
      }
      const archivedEarlier = await prisma.phone.count({ where: { lotId: id, deletedAt: { not: null }, NOT: { deletedAt: lot.deletedAt } } });
      if (archivedEarlier) issues.push({ level: "warn", message: `${archivedEarlier} unit(s) were archived separately before the lot was deleted; they stay in the recycle bin and can be restored on their own.` });
      return issues;
    }
    case "variant": {
      const variant = await prisma.phoneVariant.findUnique({ where: { id }, include: { phoneModel: true } });
      if (!variant?.deletedAt) return [{ level: "block", message: "This variant is no longer in the recycle bin." }];
      return variant.phoneModel.deletedAt ? [{ level: "block", message: `Its model ${variant.phoneModel.brand} ${variant.phoneModel.modelName} is deleted — restore the model first.` }] : [];
    }
    default:
      return [];
  }
}

/** Turns a database constraint error into something a user can act on. */
function describeDbError(error: unknown): RestoreIssue | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;
  const meta = (error.meta ?? {}) as { target?: string[] | string; field_name?: string; modelName?: string };
  const fields = Array.isArray(meta.target) ? meta.target.join(", ") : meta.target;
  switch (error.code) {
    case "P2002":
      return { level: "block", message: `Another active record already has the same ${fields || "unique value"}${meta.modelName ? ` (${meta.modelName})` : ""}. Change or remove that record, then restore again.` };
    case "P2003":
      return { level: "block", message: `It points to a record that no longer exists (${meta.field_name || "a related record"}) — that record may have been permanently deleted.` };
    case "P2025":
      return { level: "block", message: "The record no longer exists — it may already have been permanently deleted." };
    default:
      return { level: "block", message: `Database rejected the restore (${error.code}): ${error.message.split("\n").pop()}` };
  }
}

async function performRestore(kind: RecycleKind, id: string, issues: RestoreIssue[]): Promise<string | undefined> {
  switch (kind) {
    case "lot": {
      const lot = await prisma.lot.findUniqueOrThrow({ where: { id } });
      const units = await prisma.phone.findMany({ where: { lotId: id, deletedAt: lot.deletedAt }, select: { id: true, imei: true } });
      const blockedImeis = new Set((await liveImeiHolders(units.map((unit) => unit.imei), units.map((unit) => unit.id))).keys());
      const restorable = units.filter((unit) => !blockedImeis.has(unit.imei)).map((unit) => unit.id);
      await prisma.$transaction([
        prisma.lot.update({ where: { id }, data: { deletedAt: null, lotNumber: originalLotNumber(lot.lotNumber) } }),
        prisma.phone.updateMany({ where: { id: { in: restorable } }, data: { deletedAt: null } }),
      ]);
      return `Lot restored with ${restorable.length} unit(s).${issues.length ? " Some items need attention — see below." : ""}`;
    }
    case "phone":
      await prisma.phone.update({ where: { id }, data: { deletedAt: null } });
      return undefined;
    case "variant":
      await prisma.phoneVariant.update({ where: { id }, data: { deletedAt: null } });
      return undefined;
    case "model":
      await prisma.phoneModel.update({ where: { id }, data: { deletedAt: null } });
      return undefined;
    case "customer":
      await prisma.customer.update({ where: { id }, data: { deletedAt: null } });
      return undefined;
    case "supplier":
      await prisma.supplier.update({ where: { id }, data: { deletedAt: null } });
      return undefined;
    case "accessory":
      await prisma.accessory.update({ where: { id }, data: { deletedAt: null } });
      return undefined;
  }
}

export async function restoreItem(kind: RecycleKind, id: string): Promise<RestoreResult> {
  if (!id) return { ok: false, error: "Missing item." };
  const issues = await checkRestore(kind, id);
  if (issues.some((issue) => issue.level === "block")) {
    return { ok: false, error: "This can't be restored yet:", issues };
  }
  try {
    const message = await performRestore(kind, id, issues);
    return { ok: true, message, issues: issues.length ? issues : undefined };
  } catch (error) {
    const described = describeDbError(error);
    if (!described) throw error;
    return { ok: false, error: "The database blocked this restore:", issues: [described] };
  }
}
