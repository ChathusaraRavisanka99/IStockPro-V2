import { prisma } from "@/lib/prisma";

/**
 * Soft-deletes a lot together with its (unsold) units. Refused once any unit from the lot
 * has been sold — that sale history must keep pointing at a live lot. The lot number is
 * freed up so it can be reused; the record itself is purged after the retention window
 * (see src/lib/purge.ts).
 */
export async function softDeleteLot(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const lot = await prisma.lot.findUnique({ where: { id }, select: { id: true, lotNumber: true, deletedAt: true } });
  if (!lot || lot.deletedAt) return { ok: false, error: "Lot not found." };

  const soldLines = await prisma.saleItem.count({ where: { phone: { lotId: id } } });
  if (soldLines > 0) {
    return { ok: false, error: "Units from this lot have already been sold, so it can't be deleted. Archive individual unsold units instead." };
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.phone.updateMany({ where: { lotId: id, deletedAt: null }, data: { deletedAt: now } }),
    prisma.lot.update({ where: { id }, data: { deletedAt: now, lotNumber: `${lot.lotNumber} [deleted ${now.getTime()}]` } }),
  ]);
  return { ok: true };
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
      payments: { select: { amount: true } },
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
