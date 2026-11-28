import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SOFT_DELETE_RETENTION_DAYS } from "@/lib/purge";
import { formatPhoneName } from "@/lib/format-item-name";
import { formatMoney } from "@/lib/currency";
import { recomputeInvoicePayments } from "@/lib/payments";
import { recomputeLotPayments } from "@/lib/lots";

export type RecycleKind = "lot" | "phone" | "variant" | "model" | "customer" | "supplier" | "accessory" | "payment" | "lotPayment";

/**
 * A reason a restore can't (fully) go ahead. "block" stops the restore; "warn" lets it
 * proceed but explains what was left behind (e.g. lot units whose IMEI is now taken).
 * `href` links to the record causing the conflict so the user can resolve it.
 */
export type RestoreIssue = {
  level: "block" | "warn";
  message: string;
  /** Where to go to fix it — a Recycle Bin row anchor (#kind-id) or a live record's page. */
  href?: string;
  linkLabel?: string;
  /** Tooltip: why the rule exists, and the steps to resolve it. */
  why?: string;
  how?: string;
};

/** Anchor of an item's row on the Recycle Bin page (rows carry id="kind-id"). */
export function binAnchor(kind: RecycleKind, id: string) {
  return `/recycle-bin#${kind}-${id}`;
}
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
    linkLabel: `Go to lot ${holder.lotNumber}`,
    why: "An IMEI identifies one physical phone, so two active units can't share it — sales, returns and warranty lookups would hit the wrong unit.",
    how: `Open lot ${holder.lotNumber}, find the unit with IMEI ${imei}, and either archive it (if it was a duplicate entry) or correct its IMEI with Edit. Then come back and restore.`,
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
      if (phone.lot.deletedAt) {
        const lotNumber = originalLotNumber(phone.lot.lotNumber);
        issues.push({
          level: "block",
          message: `Its lot ${lotNumber} is deleted — restore the lot first.`,
          href: binAnchor("lot", phone.lot.id),
          linkLabel: `Go to lot ${lotNumber}`,
          why: "Every unit must belong to a live lot — the lot holds its purchase cost, supplier and payments.",
          how: `Click "Go to lot ${lotNumber}" and press Restore on that row. Units deleted together with the lot come back automatically; if this one doesn't, restore it here afterwards.`,
        });
      }
      if (phone.phoneVariant.phoneModel.deletedAt) {
        const modelName = `${phone.phoneVariant.phoneModel.brand} ${phone.phoneVariant.phoneModel.modelName}`;
        issues.push({
          level: "block",
          message: `Its model ${modelName} is deleted — restore the model first.`,
          href: binAnchor("model", phone.phoneVariant.phoneModel.id),
          linkLabel: `Go to model ${modelName}`,
          why: "A unit is listed under its model and variant; with the model deleted it would be invisible in stock, sales and reports.",
          how: `Click "Go to model", press Restore on the model row (its variants come back with it), then restore this unit.`,
        });
      } else if (phone.phoneVariant.deletedAt) {
        issues.push({
          level: "block",
          message: `Its variant "${phone.phoneVariant.variantName}" is deleted — restore the variant first.`,
          href: binAnchor("variant", phone.phoneVariant.id),
          linkLabel: `Go to variant "${phone.phoneVariant.variantName}"`,
          why: "A unit is listed under its variant (color/storage/RAM); with the variant deleted it would be invisible in stock, sales and reports.",
          how: `Click "Go to variant", press Restore on that row, then come back and restore this unit.`,
        });
      }
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
          message: `Lot number ${lotNumber} is now used by another lot — lot numbers must be unique.`,
          href: clash.deletedAt ? binAnchor("lot", clash.id) : `/lots/${clash.id}`,
          linkLabel: `Go to lot ${lotNumber}`,
          why: "Lot numbers identify a purchase batch on documents and in IMEI lookups, so they can't repeat.",
          how: "Open the other lot and change its lot number (or delete it if it was created by mistake), then come back and restore this one.",
        });
      }
      const units = await prisma.phone.findMany({ where: { lotId: id, deletedAt: lot.deletedAt }, select: { id: true, imei: true } });
      const holders = await liveImeiHolders(units.map((unit) => unit.imei), units.map((unit) => unit.id));
      for (const unit of units) {
        const holder = holders.get(unit.imei);
        if (holder) issues.push({ ...imeiIssue("warn", unit.imei, holder), message: `Unit ${unit.imei} will stay deleted: its IMEI is already used by a live unit in lot ${holder.lotNumber}.` });
      }
      const archivedEarlier = await prisma.phone.count({ where: { lotId: id, deletedAt: { not: null }, NOT: { deletedAt: lot.deletedAt } } });
      if (archivedEarlier) {
        issues.push({
          level: "warn",
          message: `${archivedEarlier} unit(s) were archived separately before the lot was deleted; they stay in the recycle bin.`,
          href: "/recycle-bin?type=phone",
          linkLabel: "Show deleted units",
          why: "Only units deleted together with the lot are brought back with it — ones archived earlier were removed on purpose.",
          how: "After restoring the lot, open Phone units in the Recycle Bin and restore any of those you still want.",
        });
      }
      return issues;
    }
    case "variant": {
      const variant = await prisma.phoneVariant.findUnique({ where: { id }, include: { phoneModel: true } });
      if (!variant?.deletedAt) return [{ level: "block", message: "This variant is no longer in the recycle bin." }];
      if (!variant.phoneModel.deletedAt) return [];
      const modelName = `${variant.phoneModel.brand} ${variant.phoneModel.modelName}`;
      return [
        {
          level: "block",
          message: `Its model ${modelName} is deleted — restore the model first.`,
          href: binAnchor("model", variant.phoneModel.id),
          linkLabel: `Go to model ${modelName}`,
          why: "A variant always belongs to a phone model; it can't be active while its model is deleted.",
          how: "Click \"Go to model\" and press Restore — the variants deleted with it come back automatically. Otherwise restore this variant afterwards, or move it to another model from its Edit page once restored.",
        },
      ];
    }
    case "payment": {
      const payment = await prisma.payment.findUnique({ where: { id }, include: { invoice: { include: { sale: { select: { id: true, saleNumber: true } }, payments: { where: { deletedAt: null }, select: { amount: true } } } } } });
      if (!payment?.deletedAt) return [{ level: "block", message: "This payment is no longer in the recycle bin." }];
      const invoice = payment.invoice;
      if (invoice.status === "Voided") return [{ level: "block", message: `Invoice ${invoice.invoiceNumber} is voided — payments can't be added back to it.`, href: `/sales/${invoice.sale.id}`, linkLabel: `Go to sale ${invoice.sale.saleNumber}` }];
      const paid = invoice.payments.reduce((sum, row) => sum + Number(row.amount), 0);
      const over = paid + Number(payment.amount) - Number(invoice.totalAmount);
      if (over > 0.004) {
        return [
          {
            level: "block",
            message: `Restoring it would overpay invoice ${invoice.invoiceNumber} by ${formatMoney(over)} (already paid ${formatMoney(paid)} of ${formatMoney(invoice.totalAmount)}).`,
            href: `/sales/${invoice.sale.id}`,
            linkLabel: `Go to sale ${invoice.sale.saleNumber}`,
            why: "A sale can't be paid more than its total — the extra would show as money the customer never owed.",
            how: "Another payment was probably recorded after this one was deleted. Delete that one instead (or restore this and delete the other) so the total matches what the customer actually paid.",
          },
        ];
      }
      return [];
    }
    case "lotPayment": {
      const payment = await prisma.lotPayment.findUnique({ where: { id }, include: { lot: { select: { id: true, lotNumber: true, deletedAt: true } } } });
      if (!payment?.deletedAt) return [{ level: "block", message: "This payment is no longer in the recycle bin." }];
      if (payment.lot.deletedAt) {
        const lotNumber = originalLotNumber(payment.lot.lotNumber);
        return [
          {
            level: "block",
            message: `Its lot ${lotNumber} is deleted — restore the lot first.`,
            href: binAnchor("lot", payment.lot.id),
            linkLabel: `Go to lot ${lotNumber}`,
            why: "A supplier payment always belongs to a lot — it pays for that lot's goods and charges.",
            how: `Restore lot ${lotNumber} from its row here, then restore this payment.`,
          },
        ];
      }
      return [];
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
    case "model": {
      // Variants deleted together with the model share its timestamp — bring them back too.
      const model = await prisma.phoneModel.findUniqueOrThrow({ where: { id } });
      const [, variants] = await prisma.$transaction([
        prisma.phoneModel.update({ where: { id }, data: { deletedAt: null } }),
        prisma.phoneVariant.updateMany({ where: { phoneModelId: id, deletedAt: model.deletedAt }, data: { deletedAt: null } }),
      ]);
      return variants.count ? `Model restored with ${variants.count} variant(s).` : undefined;
    }
    case "customer":
      await prisma.customer.update({ where: { id }, data: { deletedAt: null } });
      return undefined;
    case "supplier":
      await prisma.supplier.update({ where: { id }, data: { deletedAt: null } });
      return undefined;
    case "accessory":
      await prisma.accessory.update({ where: { id }, data: { deletedAt: null } });
      return undefined;
    case "payment": {
      const payment = await prisma.payment.findUniqueOrThrow({ where: { id } });
      const totals = await prisma.$transaction(async (tx) => {
        await tx.payment.update({ where: { id }, data: { deletedAt: null } });
        return recomputeInvoicePayments(payment.invoiceId, tx);
      });
      return `Payment restored — the invoice is now ${totals?.status === "PartiallyPaid" ? "partly paid" : totals?.status?.toLowerCase()} (${formatMoney(totals?.paidAmount ?? 0)} paid).`;
    }
    case "lotPayment": {
      const payment = await prisma.lotPayment.findUniqueOrThrow({ where: { id } });
      const totals = await prisma.$transaction(async (tx) => {
        await tx.lotPayment.update({ where: { id }, data: { deletedAt: null } });
        return recomputeLotPayments(payment.lotId, tx);
      });
      return `Payment restored — ${formatMoney(totals?.amountPaid ?? 0)} paid to the supplier on this lot (${totals?.paymentStatus}).`;
    }
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

/** One deleted unit of a deleted lot, as offered in the "choose what to restore" popup. */
export type LotRestoreUnit = {
  id: string;
  imei: string;
  name: string;
  status: string;
  soldIn: string[];
  /** Deleted in the same action as the lot (vs archived separately earlier). */
  withLot: boolean;
  /** Why this unit can't come back right now (it can still be left deleted). */
  blocked: string | null;
};

/**
 * What a deleted lot can be restored with: its deleted units, each flagged if a constraint
 * (IMEI now used by a live unit, its variant/model deleted) blocks it. `lotIssues` are
 * problems with the lot itself, which block the whole restore.
 */
export async function lotRestoreOptions(lotId: string): Promise<{ lotIssues: RestoreIssue[]; units: LotRestoreUnit[] }> {
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot?.deletedAt) return { lotIssues: [{ level: "block", message: "This lot is no longer in the recycle bin." }], units: [] };
  const lotIssues = (await checkRestore("lot", lotId)).filter((issue) => issue.level === "block");
  const phones = await prisma.phone.findMany({
    where: { lotId, deletedAt: { not: null } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      imei: true,
      status: true,
      deletedAt: true,
      phoneVariant: { include: { phoneModel: true } },
      saleItems: { select: { sale: { select: { saleNumber: true } } } },
    },
  });
  const holders = await liveImeiHolders(phones.map((phone) => phone.imei), phones.map((phone) => phone.id));
  return {
    lotIssues,
    units: phones.map((phone) => {
      const holder = holders.get(phone.imei);
      const model = phone.phoneVariant.phoneModel;
      const blocked = holder
        ? `IMEI is now used by a live unit in lot ${holder.lotNumber}.`
        : model.deletedAt
          ? `Its model ${model.brand} ${model.modelName} is deleted — restore the model first.`
          : phone.phoneVariant.deletedAt
            ? `Its variant "${phone.phoneVariant.variantName}" is deleted — restore the variant first.`
            : null;
      return {
        id: phone.id,
        imei: phone.imei,
        name: formatPhoneName(phone.phoneVariant),
        status: phone.status,
        soldIn: phone.saleItems.map((line) => line.sale.saleNumber),
        withLot: phone.deletedAt!.getTime() === lot.deletedAt!.getTime(),
        blocked,
      };
    }),
  };
}

/**
 * Restores a lot plus exactly the chosen units (units can't come back without their lot, so
 * the lot is always included). Everything is re-checked against live data first.
 */
export async function restoreLotSelection(lotId: string, unitIds: string[]): Promise<RestoreResult> {
  const { lotIssues, units } = await lotRestoreOptions(lotId);
  if (lotIssues.length) return { ok: false, error: "The lot itself can't be restored yet:", issues: lotIssues };
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const ids = Array.from(new Set(unitIds));
  const chosen = ids.map((id) => byId.get(id));
  const problems: RestoreIssue[] = [];
  for (let index = 0; index < chosen.length; index++) {
    const unit = chosen[index];
    if (!unit) problems.push({ level: "block", message: `Unit ${ids[index]} isn't a deleted unit of this lot any more.` });
    else if (unit.blocked) problems.push({ level: "block", message: `${unit.name} (IMEI ${unit.imei}): ${unit.blocked}` });
  }
  if (problems.length) return { ok: false, error: "Some of the chosen units can't be restored — untick them or fix the problem first:", issues: problems };
  const lot = await prisma.lot.findUniqueOrThrow({ where: { id: lotId } });
  try {
    await prisma.$transaction([
      prisma.lot.update({ where: { id: lotId }, data: { deletedAt: null, lotNumber: originalLotNumber(lot.lotNumber) } }),
      prisma.phone.updateMany({ where: { id: { in: chosen.map((unit) => unit!.id) }, lotId }, data: { deletedAt: null } }),
    ]);
  } catch (error) {
    const described = describeDbError(error);
    if (!described) throw error;
    return { ok: false, error: "The database blocked this restore:", issues: [described] };
  }
  const left = units.length - chosen.length;
  return {
    ok: true,
    message: `Lot ${originalLotNumber(lot.lotNumber)} restored with ${chosen.length} unit${chosen.length === 1 ? "" : "s"}${left ? ` — ${left} left in the Recycle Bin` : ""}.`,
  };
}
