import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/currency";
import { recomputeLotPayments } from "@/lib/lots";

/**
 * Customer payments (on a sale's invoice) and supplier payments (on a lot) are soft-deleted:
 * a deleted payment sits in the Recycle Bin for 30 days and no longer counts towards what's
 * paid. The paid totals and payment statuses are always recomputed from the live payments.
 */

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Recomputes an invoice's paid amount and status from its non-deleted payments. */
export async function recomputeInvoicePayments(invoiceId: string, tx: Tx | typeof prisma = prisma) {
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { status: true, totalAmount: true, payments: { where: { deletedAt: null }, select: { amount: true } } } });
  if (!invoice) return null;
  const paidAmount = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const total = Number(invoice.totalAmount);
  // Voided / draft invoices keep their status; otherwise it follows the money.
  const status = invoice.status === "Voided" || invoice.status === "Draft" ? invoice.status : paidAmount <= 0 ? "Unpaid" : paidAmount >= total - 0.004 ? "Paid" : "PartiallyPaid";
  await tx.invoice.update({ where: { id: invoiceId }, data: { paidAmount, status } });
  return { paidAmount, total, status };
}

/** What deleting a customer payment does, for the confirm popup. */
export function customerPaymentDeleteConsequences(payment: { amount: unknown; paidAt: Date; method: string }, invoice: { invoiceNumber: string; totalAmount: unknown; paidAmount: unknown }) {
  const paidAfter = Math.max(0, Number(invoice.paidAmount) - Number(payment.amount));
  const owedAfter = Math.max(0, Number(invoice.totalAmount) - paidAfter);
  return [
    `The ${formatMoney(payment.amount)} ${payment.method} payment of ${payment.paidAt.toISOString().slice(0, 10)} stops counting towards invoice ${invoice.invoiceNumber}.`,
    `Paid drops from ${formatMoney(invoice.paidAmount)} to ${formatMoney(paidAfter)}; the customer then owes ${formatMoney(owedAfter)} and the invoice status is updated.`,
    "It shows up again in Unpaid sales, Customers who owe and the customer's balance.",
    "The payment goes to the Recycle Bin for 30 days — restoring it puts the money back on the invoice.",
  ];
}

export async function softDeleteCustomerPayment(id: string) {
  const payment = await prisma.payment.findUnique({ where: { id }, include: { invoice: { select: { id: true, saleId: true } } } });
  if (!payment || payment.deletedAt) return { ok: false as const, error: "Payment not found — it may already be deleted." };
  await prisma.$transaction(async (tx) => {
    await tx.payment.update({ where: { id }, data: { deletedAt: new Date() } });
    await recomputeInvoicePayments(payment.invoiceId, tx);
  });
  return { ok: true as const, payment };
}

export async function softDeleteLotPayment(id: string) {
  const payment = await prisma.lotPayment.findUnique({ where: { id } });
  if (!payment || payment.deletedAt) return { ok: false as const, error: "Payment not found — it may already be deleted." };
  await prisma.$transaction(async (tx) => {
    await tx.lotPayment.update({ where: { id }, data: { deletedAt: new Date() } });
    await recomputeLotPayments(payment.lotId, tx);
  });
  return { ok: true as const, payment };
}
