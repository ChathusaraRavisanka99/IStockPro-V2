import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/currency";
import { formatPhoneName } from "@/lib/format-item-name";

/**
 * Deleting a return undoes what recording it did: returned phones go back to "Sold" (to the
 * original customer), returned accessory quantities leave stock again, and the credit note is
 * removed. It's refused when undoing would corrupt stock — the phone was resold or deleted since,
 * or the accessory stock has already been used up.
 */
export const RETURN_DELETE_INCLUDE = {
  sale: { select: { id: true, saleNumber: true } },
  returnInvoice: true,
  items: {
    include: {
      phone: {
        select: {
          id: true,
          imei: true,
          status: true,
          deletedAt: true,
          phoneVariant: { include: { phoneModel: true } },
          saleItems: { select: { id: true, sale: { select: { saleNumber: true } } } },
        },
      },
      accessory: { select: { id: true, name: true, quantity: true, deletedAt: true } },
    },
  },
} as const;

type ReturnWithItems = NonNullable<Awaited<ReturnType<typeof loadReturn>>>;

export function loadReturn(id: string) {
  return prisma.return.findUnique({ where: { id }, include: RETURN_DELETE_INCLUDE });
}

export function returnDeleteImpact(ret: ReturnWithItems): { blocked: string | null; consequences: string[] } {
  const problems: string[] = [];
  const consequences: string[] = [];
  for (const item of ret.items) {
    if (item.phone) {
      const name = `${formatPhoneName(item.phone.phoneVariant)} (IMEI ${item.phone.imei})`;
      const resold = item.phone.saleItems.filter((line) => line.id !== item.saleItemId);
      if (item.phone.deletedAt) problems.push(`${name} has been deleted since the return — restore it from the Recycle Bin first.`);
      else if (resold.length) problems.push(`${name} was sold again in ${resold.map((line) => line.sale.saleNumber).join(", ")} after this return.`);
      else consequences.push(`${name} goes back to "Sold" on ${ret.sale.saleNumber}${item.phone.status !== "Returned" ? ` (it is "${item.phone.status}" right now)` : ""} and leaves stock.`);
    } else if (item.accessory) {
      if (item.accessory.deletedAt) problems.push(`${item.accessory.name} has been deleted since the return.`);
      else if (item.accessory.quantity < item.quantity) problems.push(`Only ${item.accessory.quantity} × ${item.accessory.name} left in stock, but ${item.quantity} would need to be taken back out.`);
      else consequences.push(`${item.quantity} × ${item.accessory.name} come out of stock again (${item.accessory.quantity} → ${item.accessory.quantity - item.quantity}) and count as sold.`);
    }
  }
  if (ret.returnInvoice) consequences.push(`Credit note ${ret.returnInvoice.creditNoteNumber} (${formatMoney(ret.returnInvoice.totalCredit)}) is removed — refund totals in reports and the dashboard drop by that amount.`);
  consequences.push("Lot return-rate and damage stats no longer count this return.");
  consequences.push("This can't be restored from the Recycle Bin; a full copy is kept in the audit log.");
  return { blocked: problems.length ? `This return can't be deleted: ${problems.join(" ")}` : null, consequences };
}

/** Undo + delete in one transaction. Re-checks the rules against live data. */
export async function deleteReturn(id: string): Promise<{ ok: true; snapshot: unknown } | { ok: false; error: string }> {
  const ret = await loadReturn(id);
  if (!ret) return { ok: false, error: "Return not found — it may already be deleted." };
  const impact = returnDeleteImpact(ret);
  if (impact.blocked) return { ok: false, error: impact.blocked };
  await prisma.$transaction(async (tx) => {
    for (const item of ret.items) {
      if (item.phoneId) await tx.phone.update({ where: { id: item.phoneId }, data: { status: "Sold" } });
      else if (item.accessoryId) await tx.accessory.update({ where: { id: item.accessoryId }, data: { quantity: { decrement: item.quantity }, soldQuantity: { increment: item.quantity } } });
    }
    await tx.return.delete({ where: { id } }); // items + credit note cascade
  });
  return {
    ok: true,
    snapshot: {
      returnNumber: ret.returnNumber,
      saleNumber: ret.sale.saleNumber,
      returnDate: ret.returnDate,
      reason: ret.reason,
      creditNote: ret.returnInvoice ? { number: ret.returnInvoice.creditNoteNumber, totalCredit: String(ret.returnInvoice.totalCredit) } : null,
      items: ret.items.map((item) => ({ saleItemId: item.saleItemId, phoneId: item.phoneId, imei: item.phone?.imei ?? null, accessoryId: item.accessoryId, quantity: item.quantity, condition: item.condition, lineAmount: String(item.lineAmount), notes: item.notes })),
    },
  };
}
