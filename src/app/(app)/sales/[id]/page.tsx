import { revalidatePath } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { canViewCost } from "@/lib/rbac";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { InfoHelp } from "@/components/ui/info-help";
import { formatMoney } from "@/lib/currency";
import { formatSaleItemName } from "@/lib/format-item-name";
import { uploadFile, getSignedDownloadUrl, isStorageKey, buildKey } from "@/lib/storage";
import { EntityLink } from "@/components/ui/entity-link";
import { withErrorLog } from "@/lib/error-log";
import { EntityDeleteButton, EntityEditButton } from "@/components/ui/entity-editor";
import { customerPaymentDeleteConsequences, softDeleteCustomerPayment } from "@/lib/payments";
import { auditChange, requireReauthWhen } from "@/lib/entity-guard";
import type { ActionResult } from "@/components/ui/editable-row";

import { SaleDeleteDialog } from "@/components/sales/sale-delete-dialog";
import { deleteSale, loadSaleForDelete, saleDeleteImpact, type LineChoice } from "@/lib/sale-delete";
import { canVoidInvoices } from "@/lib/rbac";
import { checkReauth } from "@/lib/reauth";
export default async function SaleDetailPage({ params, searchParams }: { params: { id: string }; searchParams?: { delete?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) notFound();
  const canManagePayments = canViewCost(session.user?.role as "admin" | "manager" | "staff" | undefined);

  const sale = await prisma.sale.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      invoice: { include: { payments: { where: { deletedAt: null }, orderBy: { paidAt: "desc" } } } },
      items: { include: { phone: { include: { phoneVariant: { include: { phoneModel: true } } } }, accessory: true } },
    },
  });
  if (!sale) notFound();
  const canDeleteSale = canVoidInvoices(session.user?.role as "admin" | "manager" | "staff" | undefined);
  const forDelete = canDeleteSale ? await loadSaleForDelete(sale.id) : null;
  const deleteImpact = forDelete ? saleDeleteImpact(forDelete) : null;

  // Customer payments are money records: deleting one is sensitive (admins/managers + password).
  // It goes to the Recycle Bin and the invoice's paid total and status are recomputed.
  async function removePayment(formData: FormData): Promise<ActionResult> {
    "use server";
    return withErrorLog("sales/detail: removePayment", formData, async () => {
      const actor = await getServerSession(authOptions);
      if (!canViewCost(actor?.user?.role as "admin" | "manager" | "staff" | undefined)) return { ok: false, error: "Only admins and managers can delete payments." };
      const reauth = await checkReauth(formData);
      if (!reauth.ok) return reauth;
      const id = String(formData.get("id") || "");
      const owned = await prisma.payment.findFirst({ where: { id, invoice: { saleId: params.id } }, select: { id: true } });
      if (!owned) return { ok: false, error: "Payment not found on this sale." };
      const result = await softDeleteCustomerPayment(id);
      if (!result.ok) return result;
      await auditChange("SensitiveDelete", "Payment", id, actor?.user?.id, { saleId: params.id, amount: Number(result.payment.amount), method: result.payment.method, paidAt: result.payment.paidAt.toISOString().slice(0, 10), reference: result.payment.reference });
      for (const path of [`/sales/${params.id}`, "/sales", "/dashboard", "/reports", "/customers", "/recycle-bin", "/lite"]) revalidatePath(path);
      return { ok: true };
    });
  }

  // Permanently deletes the sale (admins/managers, password). Each line is restocked or removed
  // from inventory as chosen; a full copy goes to the audit log.
  async function removeSale(formData: FormData): Promise<ActionResult> {
    "use server";
    return withErrorLog("sales/detail: removeSale", formData, async () => {
      const actor = await getServerSession(authOptions);
      if (!canVoidInvoices(actor?.user?.role as "admin" | "manager" | "staff" | undefined)) return { ok: false, error: "Only admins and managers can delete sales." };
      const reauth = await checkReauth(formData);
      if (!reauth.ok) return reauth;
      let choices: Record<string, LineChoice> = {};
      try {
        choices = JSON.parse(String(formData.get("choices") || "{}"));
      } catch {
        // default: restock everything
      }
      const result = await deleteSale(params.id, choices);
      if (!result.ok) return result;
      await auditChange("SensitiveDelete", "Sale", params.id, actor?.user?.id, { deleted: result.snapshot, restocked: result.restocked, removed: result.removed });
      for (const path of ["/sales", "/dashboard", "/reports", "/customers", "/items/phones", "/items/chargers", "/items/cables", "/items/handsfree", "/items/other", "/lots", "/quotations", "/recycle-bin", "/lite"]) revalidatePath(path);
      return { ok: true };
    });
  }

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
    return withErrorLog("sales/detail: recordPayment", formData, async () => {
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
    });
  }

  const customerOptions = await prisma.customer.findMany({
    where: { OR: [{ deletedAt: null }, ...(sale.customerId ? [{ id: sale.customerId }] : [])] },
    orderBy: { name: "asc" },
    select: { id: true, name: true, phone: true },
  });

  // Changing who a sale belongs to rewrites a financial record (invoice "bill to", customer
  // history, receivables), so it always goes through the review + password step and is logged.
  // Register a customer straight from the Change-customer popup; returns its id so the picker
  // selects it immediately.
  async function registerCustomer(formData: FormData) {
    "use server";
    return withErrorLog("sales/detail: registerCustomer", formData, async () => {
      const name = String(formData.get("name") || "").trim();
      if (!name) return undefined;
      const customer = await prisma.customer.create({
        data: {
          name,
          phone: String(formData.get("phone") || "").trim() || null,
          email: String(formData.get("email") || "").trim() || null,
          address: String(formData.get("address") || "").trim() || null,
        },
      });
      revalidatePath(`/sales/${params.id}`);
      revalidatePath("/customers");
      return { value: customer.id };
    });
  }

  async function changeSaleCustomer(formData: FormData): Promise<ActionResult> {
    "use server";
    return withErrorLog("sales/detail: changeSaleCustomer", formData, async () => {
      const guard = await requireReauthWhen(formData, true);
      if (!guard.ok) return guard;
      const current = await prisma.sale.findUnique({ where: { id: params.id }, select: { customerId: true, customer: { select: { name: true } } } });
      if (!current) return { ok: false, error: "Sale not found." };
      const customerId = String(formData.get("customerId") || "") || null;
      if (customerId === current.customerId) return { ok: true };
      let newName = "Walk-in";
      if (customerId) {
        const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { name: true, deletedAt: true } });
        if (!customer || customer.deletedAt) return { ok: false, error: "That customer doesn't exist or is deleted." };
        newName = customer.name;
      }
      await prisma.sale.update({ where: { id: params.id }, data: { customerId } });
      const actor = await getServerSession(authOptions);
      await auditChange("SensitiveEdit", "Sale", params.id, actor?.user?.id, {
        changes: [{ field: "customer", before: current.customer?.name ?? "Walk-in", after: newName }],
      });
      revalidatePath(`/sales/${params.id}`);
      revalidatePath("/sales");
      revalidatePath("/customers");
      if (current.customerId) revalidatePath(`/customers/${current.customerId}`);
      if (customerId) revalidatePath(`/customers/${customerId}`);
      return { ok: true };
    });
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
        actions={
          <>
            <Link href={`/sales/${sale.id}/receipt`} className="btn btn-md btn-secondary">Print Receipt</Link>
            {deleteImpact ? (
              <SaleDeleteDialog
                saleId={sale.id}
                saleNumber={sale.saleNumber}
                lines={deleteImpact.lines}
                consequences={deleteImpact.consequences}
                blocked={deleteImpact.blocked}
                username={session.user?.username}
                action={removeSale}
                autoOpen={searchParams?.delete === "1"}
              />
            ) : null}
          </>
        }
        help={
          <p>
            This sale&apos;s invoice, payment history, and line items. If it isn&apos;t fully paid, record payments below
            as they come in — the status badge and remaining balance update automatically.
          </p>
        }
      />
      <div className="mb-4">
        <Link href="/sales" className="text-sm text-slate-700 underline">Back to Sales</Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <p className="text-xs font-semibold uppercase text-slate-500">Customer</p>
          <p className="mt-2 font-semibold text-slate-900">{sale.customer ? <EntityLink kind="customer" id={sale.customer.id}>{sale.customer.name}</EntityLink> : "Walk-in customer"}</p>
          <p className="mt-1 text-sm text-slate-700">{sale.customer?.phone || sale.customer?.email || "No contact details"}</p>
          {sale.status !== "Voided" ? (
            <div className="mt-3">
              <EntityEditButton
                title="Change customer"
                subtitle={`Sale ${sale.saleNumber}`}
                label="Change customer"
                username={session?.user?.username}
                action={changeSaleCustomer}
                note="The sale, invoice and receipt will show the new customer, and the sale moves to their purchase history. You'll review the change and confirm with your password."
                fields={[
                  {
                    name: "customerId",
                    label: "Customer",
                    value: sale.customerId ?? "",
                    type: "searchable",
                    sensitive: true,
                    wide: true,
                    placeholder: "Search customers…",
                    quickAdd: {
                      label: "Customer",
                      action: registerCustomer,
                      fields: [
                        { name: "name", label: "Name", required: true },
                        { name: "phone", label: "Phone" },
                        { name: "email", label: "Email" },
                        { name: "address", label: "Address" },
                      ],
                    },
                    options: [{ value: "", label: "Walk-in customer" }, ...customerOptions.map((customer) => ({ value: customer.id, label: customer.phone ? `${customer.name} · ${customer.phone}` : customer.name }))],
                  },
                ]}
              />
            </div>
          ) : null}
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase text-slate-500">Sale</p>
          <p className="mt-2 text-sm text-slate-700">Date: {sale.saleDate.toISOString().slice(0, 10)}</p>
          <p className="text-sm text-slate-700">Status: {sale.status}</p>
          <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${sale.saleType === "Wholesale" ? "bg-purple-100 text-purple-800" : "bg-slate-100 text-slate-700"}`}>{sale.saleType}</span>
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
          <h2 className="mb-3 flex items-center gap-1.5 text-lg font-semibold">
            Record a Payment
            <InfoHelp size="sm" title="Record a Payment">
              Log a payment against this invoice&apos;s remaining balance. You can attach a photo or PDF of the payment slip as proof — it&apos;s kept alongside the payment record below.
            </InfoHelp>
          </h2>
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
              <button className="btn btn-md btn-primary md:col-span-2 xl:col-span-4">Record Payment</button>
            </form>
          ) : (
            <p className="text-sm text-green-700">This invoice is fully paid.</p>
          )}

          {invoice.payments.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2">Amount</th>
                    <th className="px-2 py-2">Method</th>
                    <th className="px-2 py-2">Reference</th>
                    <th className="px-2 py-2">Slip</th>
                    {canManagePayments ? <th className="px-2 py-2 text-right">Actions</th> : null}
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
                      {canManagePayments ? (
                        <td className="px-2 py-2 text-right">
                          <EntityDeleteButton
                            title={`Delete payment of ${formatMoney(Number(payment.amount))}?`}
                            sensitive
                            username={session.user?.username}
                            fields={{ id: payment.id }}
                            action={removePayment}
                            confirmLabel="Delete payment"
                            buttonClassName="btn btn-xs btn-danger"
                            consequences={customerPaymentDeleteConsequences(payment, invoice)}
                          />
                        </td>
                      ) : null}
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
        <h2 className="mb-3 flex items-center gap-1.5 text-lg font-semibold">
          Line Items
          <InfoHelp size="sm" title="Line Items">
            The phones and accessories included in this sale, with the price each was sold at.
          </InfoHelp>
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
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
                    {item.phoneId ? (
                      <EntityLink kind="phone" id={item.phoneId}>{formatSaleItemName(item)}</EntityLink>
                    ) : item.accessoryId ? (
                      <EntityLink kind="accessory" id={item.accessoryId}>{formatSaleItemName(item)}</EntityLink>
                    ) : (
                      formatSaleItemName(item)
                    )}
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
