import { revalidatePath } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { canViewCost } from "@/lib/rbac";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatMoney } from "@/lib/currency";
import { uploadFile, getSignedDownloadUrl, isStorageKey, buildKey } from "@/lib/storage";

export default async function SaleDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) notFound();
  const canManagePayments = canViewCost(session.user?.role as "admin" | "manager" | "staff" | undefined);

  const sale = await prisma.sale.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      invoice: { include: { payments: { orderBy: { paidAt: "desc" } } } },
      items: { include: { phone: { include: { phoneVariant: { include: { phoneModel: true } } } }, accessory: true } },
    },
  });
  if (!sale) notFound();

  const invoice = sale.invoice;
  const totalAmount = Number(invoice?.totalAmount ?? sale.totalAmount);
  const paidAmount = Number(invoice?.paidAmount ?? 0);
  const remaining = Math.max(0, totalAmount - paidAmount);

  const paymentProofLinks = invoice
    ? await Promise.all(
        invoice.payments.map((payment) => (payment.proofImageUrl ? (isStorageKey(payment.proofImageUrl) ? getSignedDownloadUrl(payment.proofImageUrl) : payment.proofImageUrl) : null))
      )
    : [];

  async function recordPayment(formData: FormData) {
    "use server";

    if (!invoice) return;
    const amount = Number(formData.get("amount") || 0);
    const methodInput = String(formData.get("method") || "Cash");
    const method = (["Cash", "Card", "BankTransfer", "Cheque", "UPI", "Other"].includes(methodInput) ? methodInput : "Cash") as "Cash" | "Card" | "BankTransfer" | "Cheque" | "UPI" | "Other";
    const reference = String(formData.get("reference") || "").trim() || null;
    const paidAtInput = String(formData.get("paidAt") || "").trim();
    const paidAt = paidAtInput ? new Date(paidAtInput) : new Date();

    if (!amount || amount <= 0) return;

    let proofImageUrl: string | null = null;
    const proofFile = formData.get("proofFile");
    if (proofFile instanceof File && proofFile.size > 0) {
      const key = buildKey(`payments/${invoice.id}`, proofFile.name);
      await uploadFile(Buffer.from(await proofFile.arrayBuffer()), key, proofFile.type || "application/octet-stream");
      proofImageUrl = key;
    }

    await prisma.$transaction(async (tx) => {
      await tx.payment.create({ data: { invoiceId: invoice.id, amount, method, reference, paidAt, proofImageUrl } });

      const currentInvoice = await tx.invoice.findUnique({ where: { id: invoice.id } });
      if (!currentInvoice) return;

      const newPaid = Number(currentInvoice.paidAmount) + amount;
      const newStatus = newPaid <= 0 ? "Unpaid" : newPaid >= Number(currentInvoice.totalAmount) ? "Paid" : "PartiallyPaid";
      await tx.invoice.update({ where: { id: invoice.id }, data: { paidAmount: newPaid, status: newStatus } });
    });

    revalidatePath(`/sales/${params.id}`);
    revalidatePath("/sales");
    revalidatePath("/reports");
  }

  const statusColor =
    invoice?.status === "Paid"
      ? "bg-green-100 text-green-800"
      : invoice?.status === "PartiallyPaid"
        ? "bg-amber-100 text-amber-800"
        : invoice?.status === "Voided"
          ? "bg-slate-200 text-slate-700"
          : "bg-red-100 text-red-800";

  return (
    <div>
      <PageHeader
        title={`Sale ${sale.saleNumber}`}
        subtitle="Manage payments and view line items"
        actions={<Link href={`/sales/${sale.id}/receipt`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800">Print Receipt</Link>}
      />
      <div className="mb-4">
        <Link href="/sales" className="text-sm text-slate-700 underline">Back to Sales</Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <p className="text-xs font-semibold uppercase text-slate-500">Customer</p>
          <p className="mt-2 font-semibold text-slate-900">{sale.customer?.name || "Walk-in customer"}</p>
          <p className="mt-1 text-sm text-slate-700">{sale.customer?.phone || sale.customer?.email || "No contact details"}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase text-slate-500">Sale</p>
          <p className="mt-2 text-sm text-slate-700">Date: {sale.saleDate.toISOString().slice(0, 10)}</p>
          <p className="text-sm text-slate-700">Status: {sale.status}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase text-slate-500">Payment</p>
          <p className="mt-2">
            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}>{invoice?.status || "No invoice"}</span>
          </p>
          <p className="mt-2 text-sm text-slate-700">Total: {formatMoney(totalAmount)}</p>
          <p className="text-sm text-slate-700">Paid: {formatMoney(paidAmount)}</p>
          <p className="text-sm font-medium text-slate-900">Remaining: {formatMoney(remaining)}</p>
        </Card>
      </div>

      {invoice && canManagePayments ? (
        <Card className="mt-4">
          <h2 className="mb-3 text-lg font-semibold">Record a Payment</h2>
          {remaining > 0 ? (
            <form action={recordPayment} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="grid min-w-0 gap-1 text-sm text-slate-700">
                Amount
                <input name="amount" type="number" step="0.01" min={0.01} max={remaining} required placeholder={`Remaining: ${formatMoney(remaining)}`} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
              </label>
              <label className="grid min-w-0 gap-1 text-sm text-slate-700">
                Method
                <select name="method" defaultValue="Cash" className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2">
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="BankTransfer">Bank Transfer</option>
                  <option value="Cheque">Cheque</option>
                  <option value="UPI">UPI</option>
                  <option value="Other">Other</option>
                </select>
              </label>
              <label className="grid min-w-0 gap-1 text-sm text-slate-700">
                Reference
                <input name="reference" placeholder="Receipt / transaction #" className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
              </label>
              <label className="grid min-w-0 gap-1 text-sm text-slate-700">
                Date
                <input name="paidAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
              </label>
              <label className="grid min-w-0 gap-1 text-sm text-slate-700 md:col-span-2 xl:col-span-4">
                Payment slip (optional)
                <input name="proofFile" type="file" accept="image/*,application/pdf" className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
              </label>
              <button className="rounded-lg bg-slate-900 px-3 py-2 text-white md:col-span-2 xl:col-span-4">Record Payment</button>
            </form>
          ) : (
            <p className="text-sm text-green-700">This invoice is fully paid.</p>
          )}

          {invoice.payments.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-300 text-left text-slate-700">
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2">Amount</th>
                    <th className="px-2 py-2">Method</th>
                    <th className="px-2 py-2">Reference</th>
                    <th className="px-2 py-2">Slip</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.payments.map((payment, i) => (
                    <tr key={payment.id} className="border-b border-slate-200">
                      <td className="px-2 py-2">{payment.paidAt.toISOString().slice(0, 10)}</td>
                      <td className="px-2 py-2">{formatMoney(Number(payment.amount))}</td>
                      <td className="px-2 py-2">{payment.method}</td>
                      <td className="px-2 py-2">{payment.reference || "-"}</td>
                      <td className="px-2 py-2">
                        {paymentProofLinks[i] ? (
                          <a href={paymentProofLinks[i] as string} target="_blank" rel="noreferrer" className="text-slate-800 underline">View</a>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-600">No payments recorded yet.</p>
          )}
        </Card>
      ) : null}

      <Card className="mt-4">
        <h2 className="mb-3 text-lg font-semibold">Line Items</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-slate-700">
                <th className="px-2 py-2">Item</th>
                <th className="px-2 py-2">Qty</th>
                <th className="px-2 py-2">Unit Price</th>
                <th className="px-2 py-2">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item) => (
                <tr key={item.id} className="border-b border-slate-200">
                  <td className="px-2 py-2">
                    {item.phone
                      ? `${item.phone.phoneVariant.phoneModel.brand} ${item.phone.phoneVariant.phoneModel.modelName} - IMEI ${item.phone.imei}`
                      : item.accessory
                        ? `${item.accessory.name} (${item.accessory.sku})`
                        : "Line item"}
                  </td>
                  <td className="px-2 py-2">{item.quantity}</td>
                  <td className="px-2 py-2">{formatMoney(Number(item.unitPrice))}</td>
                  <td className="px-2 py-2">{formatMoney(Number(item.lineTotal))}</td>
                </tr>
              ))}
              {!sale.items.length ? (
                <tr>
                  <td colSpan={4} className="px-2 py-4 text-slate-600">
                    No line items recorded.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
