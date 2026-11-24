import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/currency";
import { formatSaleItemName } from "@/lib/format-item-name";

/**
 * Permanently deleting a sale. Each line chooses what happens to the goods:
 *  - "restock": the phone goes back to In stock / the accessory quantity goes back up;
 *  - "remove":  the goods leave inventory — a phone moves to the Recycle Bin (as In stock, so
 *               restoring it puts it back on sale), accessory units are not put back.
 * The invoice and its payments go with the sale; a quotation converted into it is unlinked.
 * Refused while the sale has returns (delete those first — they already moved the stock).
 * A full copy of the sale is written to the audit log.
 */
export type LineChoice = "restock" | "remove";

const INCLUDE = {
  customer: { select: { name: true } },
  invoice: { include: { payments: { select: { amount: true, method: true, paidAt: true, reference: true } } } },
  returns: { select: { id: true, returnNumber: true } },
  sourceQuotation: { select: { id: true, quoteNumber: true } },
  items: {
    include: {
      phone: { include: { phoneVariant: { include: { phoneModel: true } } } },
      accessory: true,
    },
  },
} as const;

export function loadSaleForDelete(id: string) {
  return prisma.sale.findUnique({ where: { id }, include: INCLUDE });
}

type SaleForDelete = NonNullable<Awaited<ReturnType<typeof loadSaleForDelete>>>;

export type SaleDeleteLine = { id: string; label: string; kind: "phone" | "accessory" | "other"; quantity: number; amount: number; note: string | null };

/** Lines and consequences for the confirm popup. */
export function saleDeleteImpact(sale: SaleForDelete) {
  const lines: SaleDeleteLine[] = sale.items.map((item) => ({
    id: item.id,
    label: formatSaleItemName(item),
    kind: item.phone ? "phone" : item.accessory ? "accessory" : "other",
    quantity: item.quantity,
    amount: Number(item.lineTotal),
    note: item.phone?.deletedAt ? "This phone is already deleted — it stays deleted." : item.accessory?.deletedAt ? "This accessory is deleted — restocking adds to the deleted record." : null,
  }));
  const paid = sale.invoice?.payments.reduce((sum, payment) => sum + Number(payment.amount), 0) ?? 0;
  const consequences = [
    `Sale ${sale.saleNumber} (${formatMoney(sale.totalAmount)}, ${sale.saleDate.toISOString().slice(0, 10)}${sale.customer ? `, ${sale.customer.name}` : ""}) is permanently deleted — revenue, profit and dashboard figures drop by its amount.`,
    sale.invoice ? `Invoice ${sale.invoice.invoiceNumber} is deleted with it.` : "It has no invoice.",
    sale.invoice?.payments.length ? `${sale.invoice.payments.length} customer payment(s) totalling ${formatMoney(paid)} are deleted — refund the customer separately if needed.` : "No payments were recorded on it.",
    ...(sale.sourceQuotation ? [`Quotation ${sale.sourceQuotation.quoteNumber} is unlinked from it and goes back to "Accepted".`] : []),
    "Each item below is restocked or removed from inventory, as you choose.",
    "A full copy of the sale is kept in the audit log; the sale itself can't be restored.",
  ];
  const blocked = sale.returns.length
    ? `This sale has ${sale.returns.length} return(s) (${sale.returns.map((ret) => ret.returnNumber).join(", ")}). Delete those on the Returns page first — they already moved the stock back.`
    : null;
  return { lines, consequences, blocked };
}

export async function deleteSale(id: string, choices: Record<string, LineChoice>): Promise<{ ok: true; snapshot: unknown; restocked: number; removed: number } | { ok: false; error: string }> {
  const sale = await loadSaleForDelete(id);
  if (!sale) return { ok: false, error: "Sale not found — it may already be deleted." };
  const impact = saleDeleteImpact(sale);
  if (impact.blocked) return { ok: false, error: impact.blocked };
  const { restocked, removed } = await prisma.$transaction((tx) => applySaleDelete(tx, sale, choices));
  return finishResult(sale, choices, restocked, removed);
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** The writes of a sale deletion, inside a transaction (exported so it can be verified with a rollback). */
export async function applySaleDelete(tx: Tx, sale: SaleForDelete, choices: Record<string, LineChoice>) {
  const now = new Date();
  let restocked = 0;
  let removed = 0;
  {
    for (const item of sale.items) {
      const choice: LineChoice = choices[item.id] === "remove" ? "remove" : "restock";
      if (item.phoneId && item.phone) {
        if (item.phone.deletedAt) continue;
        if (choice === "restock") {
          await tx.phone.update({ where: { id: item.phoneId }, data: { status: "InStock" } });
          restocked += 1;
        } else {
          // In the Recycle Bin as "In stock": restoring it puts it straight back on sale.
          await tx.phone.update({ where: { id: item.phoneId }, data: { status: "InStock", deletedAt: now } });
          removed += 1;
        }
      } else if (item.accessoryId) {
        await tx.accessory.update({
          where: { id: item.accessoryId },
          data: choice === "restock" ? { quantity: { increment: item.quantity }, soldQuantity: { decrement: item.quantity } } : { soldQuantity: { decrement: item.quantity } },
        });
        if (choice === "restock") restocked += item.quantity;
        else removed += item.quantity;
      }
    }
    if (sale.sourceQuotation) await tx.quotation.update({ where: { id: sale.sourceQuotation.id }, data: { convertedSaleId: null, status: "Accepted" } });
    await tx.sale.delete({ where: { id: sale.id } }); // items, invoice and payments cascade
  }
  return { restocked, removed };
}

function finishResult(sale: SaleForDelete, choices: Record<string, LineChoice>, restocked: number, removed: number) {
  return {
    ok: true as const,
    restocked,
    removed,
    snapshot: {
      saleNumber: sale.saleNumber,
      saleDate: sale.saleDate,
      saleType: sale.saleType,
      status: sale.status,
      customer: sale.customer?.name ?? null,
      customerId: sale.customerId,
      totals: { subtotal: String(sale.subtotal), tax: String(sale.taxAmount), discount: String(sale.discount), handlingFee: String(sale.handlingFee), total: String(sale.totalAmount) },
      invoice: sale.invoice ? { number: sale.invoice.invoiceNumber, status: sale.invoice.status, paid: String(sale.invoice.paidAmount), payments: sale.invoice.payments.map((payment) => ({ ...payment, amount: String(payment.amount) })) } : null,
      quotation: sale.sourceQuotation?.quoteNumber ?? null,
      items: sale.items.map((item) => ({
        label: formatSaleItemName(item),
        phoneId: item.phoneId,
        imei: item.phone?.imei ?? null,
        accessoryId: item.accessoryId,
        quantity: item.quantity,
        unitPrice: String(item.unitPrice),
        lineTotal: String(item.lineTotal),
        choice: choices[item.id] === "remove" ? "remove" : "restock",
      })),
    },
  };
}
