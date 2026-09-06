import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ListControls } from "@/components/ui/list-controls";
import { Pagination } from "@/components/ui/pagination";
import { parsePage, parsePageSize } from "@/lib/pagination";

export default async function TaxPaymentsPage({ searchParams }: { searchParams: { search?: string; page?: string; pageSize?: string } }) {
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

  async function createTaxPayment(formData: FormData) {
    "use server";

    const period = String(formData.get("period") || "").trim();
    const amount = Number(formData.get("amount") || 0);
    const paidDate = String(formData.get("paidDate") || "").trim();
    const note = String(formData.get("note") || "").trim() || null;
    const receiptUrl = String(formData.get("receiptUrl") || "").trim() || null;

    if (!period || !paidDate) return;

    await prisma.taxPayment.create({
      data: {
        period,
        amount,
        paidDate: new Date(paidDate),
        note,
        receipts: receiptUrl
          ? {
              create: [{ fileUrl: receiptUrl }],
            }
          : undefined,
      },
    });

    revalidatePath("/tax-payments");
  }

  return (
    <div>
      <PageHeader title="Tax Payments" subtitle="Record tax settlements and receipt references" />
      <ListControls search={search} placeholder="Search tax period or note" />

      <Card className="mb-4">
        <form action={createTaxPayment} className="grid gap-3 md:grid-cols-5">
          <input name="period" required placeholder="Period (e.g. 2026-Q3)" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          <input name="amount" type="number" step="0.01" min={0} required placeholder="Amount" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          <label className="grid min-w-0 gap-1 text-sm text-slate-700">
            Paid date
            <input name="paidDate" type="date" required className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
          </label>
          <input name="receiptUrl" placeholder="Receipt URL" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          <input name="note" placeholder="Note" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          <button className="rounded-lg bg-slate-900 px-3 py-2 text-white md:col-span-5">Add Tax Payment</button>
        </form>
      </Card>
      <Pagination page={page} pageSize={pageSize} total={total} query={search ? { search } : {}} />

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
              </tr>
            </thead>
            <tbody>
              {taxPayments.map((payment) => (
                <tr key={payment.id} className="border-b border-slate-200">
                  <td className="px-2 py-2">{payment.paidDate.toISOString().slice(0, 10)}</td>
                  <td className="px-2 py-2">{payment.period}</td>
                  <td className="px-2 py-2">${Number(payment.amount).toFixed(2)}</td>
                  <td className="px-2 py-2">{payment.receipts.length}</td>
                  <td className="px-2 py-2">{payment.note || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
