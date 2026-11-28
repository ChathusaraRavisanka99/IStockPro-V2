import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/currency";
import { formatPhoneName } from "@/lib/format-item-name";

/**
 * Soft-deletes a lot together with its units (all deleted with the same timestamp, so a
 * restore can find them again). Without `cascade` it's refused once any unit has been sold;
 * with `cascade` the sold units are deleted too — their sales, invoices and returns are kept
 * untouched (they're financial history) and still show the phone. The lot number is freed up
 * so it can be reused; records are purged after the retention window (src/lib/purge.ts), except
 * units still referenced by a sale, which stay soft-deleted.
 */
export async function softDeleteLot(id: string, options: { cascade?: boolean } = {}): Promise<{ ok: true; units: number } | { ok: false; error: string }> {
  const lot = await prisma.lot.findUnique({ where: { id }, select: { id: true, lotNumber: true, deletedAt: true } });
  if (!lot || lot.deletedAt) return { ok: false, error: "Lot not found." };

  const soldLines = await prisma.saleItem.count({ where: { phone: { lotId: id } } });
  if (soldLines > 0 && !options.cascade) {
    return { ok: false, error: "Units from this lot have already been sold. Use \"Delete lot and everything in it\" to delete it together with those units." };
  }

  const now = new Date();
  const [units] = await prisma.$transaction([
    prisma.phone.updateMany({ where: { lotId: id, deletedAt: null }, data: { deletedAt: now } }),
    prisma.lot.update({ where: { id }, data: { deletedAt: now, lotNumber: `${lot.lotNumber} [deleted ${now.getTime()}]` } }),
  ]);
  return { ok: true, units: units.count };
}

/**
 * Everything a lot deletion touches, for the confirm popup: what gets deleted and what is
 * deliberately kept. `sold` > 0 means only the cascade delete is possible.
 */
export async function lotDeleteImpact(id: string) {
  const lot = await prisma.lot.findUnique({
    where: { id },
    include: {
      payments: { where: { deletedAt: null }, select: { amount: true } },
      accessoryItems: { select: { quantity: true, accessory: { select: { name: true } } } },
      bookmarks: { select: { userId: true } },
      phones: {
        where: { deletedAt: null },
        select: {
          id: true,
          imei: true,
          status: true,
          phoneVariant: { include: { phoneModel: true } },
          saleItems: { select: { sale: { select: { id: true, saleNumber: true } } } },
          returnItems: { select: { return: { select: { returnNumber: true } } } },
          _count: { select: { expenses: true } },
        },
      },
    },
  });
  if (!lot) return null;
  const byStatus = new Map<string, number>();
  for (const phone of lot.phones) byStatus.set(phone.status, (byStatus.get(phone.status) ?? 0) + 1);
  const soldPhones = lot.phones.filter((phone) => phone.saleItems.length);
  const sales = new Map<string, string>();
  for (const phone of soldPhones) for (const line of phone.saleItems) sales.set(line.sale.id, line.sale.saleNumber);
  const returns = new Set(lot.phones.flatMap((phone) => phone.returnItems.map((item) => item.return.returnNumber)));
  const expenses = lot.phones.reduce((sum, phone) => sum + phone._count.expenses, 0);
  const accessoryUnits = lot.accessoryItems.reduce((sum, item) => sum + item.quantity, 0);
  const list = (values: string[], max = 6) => values.slice(0, max).join(", ") + (values.length > max ? ` +${values.length - max} more` : "");

  const deleted: string[] = [
    `Lot ${lot.lotNumber} itself (it leaves the lot list, dashboard and reports; its lot number becomes free).`,
  ];
  if (lot.phones.length) {
    deleted.push(
      `${lot.phones.length} phone unit${lot.phones.length === 1 ? "" : "s"}: ${Array.from(byStatus.entries()).map(([status, count]) => `${count} ${status}`).join(", ")}.`
    );
    const unsold = lot.phones.filter((phone) => !phone.saleItems.length);
    if (unsold.length) deleted.push(`Unsold units leave stock: ${list(unsold.map((phone) => `${formatPhoneName(phone.phoneVariant)} (${phone.imei})`))}.`);
    if (soldPhones.length) deleted.push(`Sold units are hidden from stock lists: ${list(soldPhones.map((phone) => `${phone.imei} (${phone.saleItems.map((line) => line.sale.saleNumber).join(", ")})`))}.`);
  }
  if (lot.bookmarks.length) deleted.push(`${lot.bookmarks.length} bookmark(s) on this lot stop showing.`);

  const kept: string[] = [];
  if (sales.size) kept.push(`${sales.size} sale${sales.size === 1 ? "" : "s"} with their invoices and payments stay exactly as they are (${list(Array.from(sales.values()))}) — revenue reports don't change.`);
  if (returns.size) kept.push(`${returns.size} return(s) and credit notes stay (${list(Array.from(returns))}).`);
  if (lot.payments.length) kept.push(`${lot.payments.length} supplier payment(s) (${formatMoney(lot.payments.reduce((sum, payment) => sum + Number(payment.amount), 0))}) stay attached to the deleted lot and come back with it.`);
  if (expenses) kept.push(`${expenses} expense(s) linked to these units stay in Expenses.`);
  if (accessoryUnits) kept.push(`${accessoryUnits} accessory unit(s) added by this lot (${list(lot.accessoryItems.map((item) => item.accessory.name))}) stay in accessory stock.`);

  return { lotNumber: lot.lotNumber, units: lot.phones.length, sold: soldPhones.length, deleted, kept };
}

/** Stars/unstars a lot for one user; returns the new state. */
export async function toggleLotBookmark(userId: string, lotId: string): Promise<boolean> {
  const key = { userId_lotId: { userId, lotId } };
  if (await prisma.lotBookmark.findUnique({ where: key })) {
    await prisma.lotBookmark.delete({ where: key });
    return false;
  }
  await prisma.lotBookmark.create({ data: { userId, lotId } });
  return true;
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Recomputes a lot's amountPaid (sum of its payments) and payment status. Used after a payment
 * is edited or deleted — amountPaid is otherwise maintained incrementally on create.
 */
export async function recomputeLotPayments(lotId: string, tx: Tx | typeof prisma = prisma) {
  const lot = await tx.lot.findUnique({
    where: { id: lotId },
    include: {
      payments: { where: { deletedAt: null }, select: { amount: true } },
      phones: { where: { deletedAt: null }, select: { purchasePrice: true } },
      accessoryItems: { select: { unitCost: true, quantity: true } },
    },
  });
  if (!lot) return null;
  const amountPaid = lot.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const goods = lot.phones.reduce((sum, phone) => sum + Number(phone.purchasePrice), 0) + lot.accessoryItems.reduce((sum, item) => sum + Number(item.unitCost) * item.quantity, 0);
  const total = Number(lot.shippingCost) + Number(lot.taxCost) + Number(lot.customsCost) + Number(lot.otherCost) + goods;
  const paymentStatus = amountPaid <= 0 ? "Unpaid" : amountPaid >= total && total > 0 ? "Paid" : "Partial";
  await tx.lot.update({ where: { id: lotId }, data: { amountPaid, paymentStatus } });
  return { amountPaid, total, paymentStatus };
}
