import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ListControls } from "@/components/ui/list-controls";
import { Pagination } from "@/components/ui/pagination";
import { parsePage, parsePageSize } from "@/lib/pagination";
import { formatMoney } from "@/lib/currency";
import { uploadFile, getSignedDownloadUrl, isStorageKey, buildKey } from "@/lib/storage";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { EntityDeleteButton, EntityEditButton } from "@/components/ui/entity-editor";
import { auditChange, diffFields, requireReauthWhen } from "@/lib/entity-guard";
import type { ActionResult } from "@/components/ui/editable-row";

export default async function TaxPaymentsPage({ searchParams }: { searchParams: { search?: string; page?: string; pageSize?: string } }) {
  const session = await getServerSession(authOptions);
  const search = searchParams.search?.trim() || "";
  const page = parsePage(searchParams.page);
  const pageSize = parsePageSize(searchParams.pageSize);
  const taxWhere = search ? { OR: [{ period: { contains: search, mode: "insensitive" as const } }, { note: { contains: search, mode: "insensitive" as const } }] } : undefined;
  const [taxPayments, total] = await prisma.$transaction([prisma.taxPayment.findMany({
    where: taxWhere,
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: { paidDate: "desc" },
    include: { receipts: true },
  }), prisma.taxPayment.count({ where: taxWhere })]);

  const receiptLinksByPayment = await Promise.all(
    taxPayments.map((payment) =>
      Promise.all(payment.receipts.map((receipt) => (isStorageKey(receipt.fileUrl) ? getSignedDownloadUrl(receipt.fileUrl) : receipt.fileUrl)))
    )
  );

  async function createTaxPayment(formData: FormData) {
    "use server";

    const period = String(formData.get("period") || "").trim();
    const amount = Number(formData.get("amount") || 0);
    const paidDate = String(formData.get("paidDate") || "").trim();
    const note = String(formData.get("note") || "").trim() || null;

    if (!period || !paidDate) return;

    let receiptKey: string | null = null;
    const receiptFile = formData.get("receiptFile");
    if (receiptFile instanceof File && receiptFile.size > 0) {
      const key = buildKey("tax-payments", receiptFile.name);
      await uploadFile(Buffer.from(await receiptFile.arrayBuffer()), key, receiptFile.type || "application/octet-stream");
      receiptKey = key;
    }

    await prisma.taxPayment.create({
      data: {
        period,
        amount,
        paidDate: new Date(paidDate),
        note,
        receipts: receiptKey
          ? {
              create: [{ fileUrl: receiptKey }],
            }
          : undefined,
      },
    });

    revalidatePath("/tax-payments");
  }

  // Period/note are non-sensitive; amount and paid date are tax records, so changing them (or
  // deleting a payment) needs a review + password and is audit-logged.
  async function updateTaxPayment(formData: FormData): Promise<ActionResult> {
    "use server";
    const id = String(formData.get("id") || "");
    const payment = await prisma.taxPayment.findUnique({ where: { id } });
    if (!payment) return { ok: false, error: "Tax payment not found." };
    const next = {
      period: String(formData.get("period") || "").trim(),
      amount: Number(formData.get("amount") || 0),
      paidDate: String(formData.get("paidDate") || ""),
      note: String(formData.get("note") || "").trim() || null,
    };
    if (!next.period) return { ok: false, error: "Period is required." };
    if (!(next.amount > 0)) return { ok: false, error: "Amount must be greater than zero." };
    if (!next.paidDate) return { ok: false, error: "Paid date is required." };
    const changes = diffFields({ period: payment.period, amount: payment.amount, paidDate: payment.paidDate, note: payment.note }, next);
    const sensitive = changes.filter((change) => change.field === "amount" || change.field === "paidDate");
    const guard = await requireReauthWhen(formData, sensitive.length > 0);
    if (!guard.ok) return guard;
    await prisma.taxPayment.update({ where: { id }, data: { ...next, paidDate: new Date(next.paidDate) } });
    if (sensitive.length) {
      const actor = await getServerSession(authOptions);
      await auditChange("SensitiveEdit", "TaxPayment", id, actor?.user?.id, { changes });
    }
    revalidatePath("/tax-payments");
    return { ok: true };
  }

  async function deleteTaxPayment(formData: FormData): Promise<ActionResult> {
    "use server";
    const guard = await requireReauthWhen(formData, true);
    if (!guard.ok) return guard;
    const id = String(formData.get("id") || "");
    const payment = await prisma.taxPayment.findUnique({ where: { id } });
    if (!payment) return { ok: false, error: "Tax payment not found." };
    await prisma.taxPayment.delete({ where: { id } });
    const actor = await getServerSession(authOptions);
    await auditChange("SensitiveDelete", "TaxPayment", id, actor?.user?.id, { period: payment.period, amount: Number(payment.amount), paidDate: payment.paidDate.toISOString().slice(0, 10) });
    revalidatePath("/tax-payments");
    revalidatePath("/reports");
    return { ok: true };
  }

  return (
    <div>
      <PageHeader
        title="Tax Payments"
        subtitle="Record tax settlements and receipt references"
        help={
          <p>
            Log each tax payment you make with its period, amount, and paid date. Attach a receipt file if you have one —
            it&apos;s stored and can be reopened later from the table below. Use the search bar to find a payment by period
            or note.
          </p>
        }
      />

      <Card className="mb-4">
        <form action={createTaxPayment} className="grid gap-3 md:grid-cols-5">
          <label className="grid min-w-0 gap-1 text-sm text-slate-700">
            Period
            <input name="period" required placeholder="e.g. 2026-Q3" className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
          </label>
          <label className="grid min-w-0 gap-1 text-sm text-slate-700">
            Amount
            <input name="amount" type="number" step="0.01" min={0} required placeholder="Amount" className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
          </label>
          <label className="grid min-w-0 gap-1 text-sm text-slate-700">
            Paid date
            <input name="paidDate" type="date" required className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
          </label>
          <label className="grid min-w-0 gap-1 text-sm text-slate-700">
            Receipt (optional)
            <input name="receiptFile" type="file" accept="image/*,application/pdf" className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
          </label>
          <label className="grid min-w-0 gap-1 text-sm text-slate-700">
            Note
            <input name="note" placeholder="Note" className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
          </label>
          <button className="rounded-lg bg-slate-900 px-3 py-2 text-white md:col-span-5">Add Tax Payment</button>
        </form>
      </Card>

      <ListControls search={search} placeholder="Search tax period or note" showViewToggle={false} />

      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-slate-700">
                <th className="px-2 py-2">Paid Date</th>
                <th className="px-2 py-2">Period</th>
                <th className="px-2 py-2">Amount</th>
                <th className="px-2 py-2">Receipts</th>
                <th className="px-2 py-2">Note</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {taxPayments.map((payment, i) => (
                <tr key={payment.id} className="border-b border-slate-200">
                  <td className="px-2 py-2">{payment.paidDate.toISOString().slice(0, 10)}</td>
                  <td className="px-2 py-2">{payment.period}</td>
                  <td className="px-2 py-2">{formatMoney(Number(payment.amount))}</td>
                  <td className="px-2 py-2">
                    {receiptLinksByPayment[i].length ? (
                      <div className="flex flex-wrap gap-2">
                        {receiptLinksByPayment[i].map((link, j) => (
                          <a key={j} href={link} target="_blank" rel="noreferrer" className="text-slate-800 underline">
                            View {receiptLinksByPayment[i].length > 1 ? j + 1 : ""}
                          </a>
                        ))}
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-2 py-2">{payment.note || "-"}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      <EntityEditButton
                        title="Edit tax payment"
                        subtitle={`${payment.period} · ${formatMoney(Number(payment.amount))}`}
                        hidden={{ id: payment.id }}
                        action={updateTaxPayment}
                        username={session?.user?.username}
                        fields={[
                          { name: "period", label: "Period", value: payment.period, required: true },
                          { name: "amount", label: "Amount", value: String(Number(payment.amount)), type: "number", sensitive: true, money: true, required: true },
                          { name: "paidDate", label: "Paid date", value: payment.paidDate.toISOString().slice(0, 10), type: "date", sensitive: true, required: true },
                          { name: "note", label: "Note", value: payment.note ?? "", type: "textarea" },
                        ]}
                      />
                      <EntityDeleteButton
                        title={`Delete tax payment for ${payment.period}?`}
                        sensitive
                        username={session?.user?.username}
                        fields={{ id: payment.id }}
                        action={deleteTaxPayment}
                        consequences={[
                          `${formatMoney(Number(payment.amount))} paid on ${payment.paidDate.toISOString().slice(0, 10)} is removed from tax totals and the Reports P&L.`,
                          payment.receipts.length ? `Its ${payment.receipts.length} attached receipt${payment.receipts.length === 1 ? " is" : "s are"} deleted with it.` : "No receipts are attached.",
                          "This is permanent (tax payments don't go to the Recycle Bin) and is recorded in the activity log.",
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Pagination page={page} pageSize={pageSize} total={total} query={search ? { search } : {}} />
    </div>
  );
}
