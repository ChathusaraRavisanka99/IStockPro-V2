import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { formatMoney } from "@/lib/currency";

function invoiceStatusColor(status?: string) {
  if (status === "Paid") return "bg-green-100 text-green-800";
  if (status === "PartiallyPaid") return "bg-amber-100 text-amber-800";
  if (status === "Voided") return "bg-slate-200 text-slate-700";
  return "bg-red-100 text-red-800";
}

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const customer = await prisma.customer.findUnique({
    where: { id: params.id },
    include: {
      sales: { include: { invoice: true }, orderBy: { saleDate: "desc" } },
    },
  });
  if (!customer) notFound();

  const lifetimeValue = customer.sales.reduce((sum, sale) => sum + Number(sale.totalAmount), 0);
  const unpaidSales = customer.sales.filter((sale) => sale.invoice && sale.invoice.status !== "Paid" && sale.invoice.status !== "Voided");
  const totalUnpaid = unpaidSales.reduce((sum, sale) => sum + (Number(sale.invoice?.totalAmount ?? 0) - Number(sale.invoice?.paidAmount ?? 0)), 0);

  return (
    <div>
      <PageHeader title={customer.name} subtitle="Customer profile, purchase history, and outstanding balance" />
      <div className="mb-4">
        <Link href="/customers" className="text-sm text-slate-700 underline">Back to Customers</Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <p className="text-xs font-semibold uppercase text-slate-500">Contact</p>
          <p className="mt-2 text-sm text-slate-700">{customer.phone || "No phone"}</p>
          <p className="text-sm text-slate-700">{customer.email || "No email"}</p>
          <p className="text-sm text-slate-700">{customer.address || "No address"}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase text-slate-500">Lifetime Value</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">{formatMoney(lifetimeValue)}</p>
          <p className="text-sm text-slate-700">{customer.sales.length} sale{customer.sales.length === 1 ? "" : "s"}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase text-slate-500">Amount Unpaid</p>
          <p className={`mt-2 text-lg font-semibold ${totalUnpaid > 0 ? "text-red-700" : "text-green-700"}`}>{formatMoney(totalUnpaid)}</p>
          <p className="text-sm text-slate-700">{unpaidSales.length} unpaid invoice{unpaidSales.length === 1 ? "" : "s"}</p>
        </Card>
      </div>

      {unpaidSales.length ? (
        <Card className="mt-4">
          <h2 className="mb-3 text-lg font-semibold">Unpaid Invoices</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-left text-slate-700">
                  <th className="px-2 py-2">Sale #</th>
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Invoice Total</th>
                  <th className="px-2 py-2">Paid</th>
                  <th className="px-2 py-2">Remaining</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {unpaidSales.map((sale) => (
                  <tr key={sale.id} className="border-b border-slate-200">
                    <td className="px-2 py-2">{sale.saleNumber}</td>
                    <td className="px-2 py-2">{sale.saleDate.toISOString().slice(0, 10)}</td>
                    <td className="px-2 py-2">{formatMoney(sale.invoice?.totalAmount ?? 0)}</td>
                    <td className="px-2 py-2">{formatMoney(sale.invoice?.paidAmount ?? 0)}</td>
                    <td className="px-2 py-2 font-medium">{formatMoney(Number(sale.invoice?.totalAmount ?? 0) - Number(sale.invoice?.paidAmount ?? 0))}</td>
                    <td className="px-2 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${invoiceStatusColor(sale.invoice?.status)}`}>{sale.invoice?.status}</span>
                    </td>
                    <td className="px-2 py-2"><Link href={`/sales/${sale.id}`} className="text-slate-800 underline">Manage</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card className="mt-4">
        <h2 className="mb-3 text-lg font-semibold">All Sales</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-slate-700">
                <th className="px-2 py-2">Sale #</th>
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Total</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Payment</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {customer.sales.map((sale) => (
                <tr key={sale.id} className="border-b border-slate-200">
                  <td className="px-2 py-2">{sale.saleNumber}</td>
                  <td className="px-2 py-2">{sale.saleDate.toISOString().slice(0, 10)}</td>
                  <td className="px-2 py-2">{formatMoney(sale.totalAmount)}</td>
                  <td className="px-2 py-2">{sale.status}</td>
                  <td className="px-2 py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${invoiceStatusColor(sale.invoice?.status)}`}>{sale.invoice?.status || "-"}</span>
                  </td>
                  <td className="px-2 py-2"><Link href={`/sales/${sale.id}`} className="text-slate-800 underline">Manage</Link></td>
                </tr>
              ))}
              {!customer.sales.length ? (
                <tr>
                  <td colSpan={6} className="px-2 py-4 text-slate-600">No sales recorded for this customer yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
