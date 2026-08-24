import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export default async function QuotationDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) notFound();

  const quotation = await prisma.quotation.findUnique({
    where: { id: params.id },
    include: { customer: true, items: { include: { phoneModel: true, phoneVariant: true } }, convertedSale: true },
  });
  if (!quotation) notFound();

  const contactPhone = quotation.customer?.phone || quotation.customerPhone;
  const contactEmail = quotation.customer?.email || quotation.customerEmail;

  return (
    <div>
      <PageHeader title={`Quotation ${quotation.quoteNumber}`} subtitle="Quotation details and pricing summary" />
      <div className="mb-4"><Link href="/quotations" className="text-sm text-slate-700 underline">Back to Quotations</Link></div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <p className="text-xs font-semibold uppercase text-slate-500">Customer</p>
          <p className="mt-2 font-semibold text-slate-900">{quotation.customer?.name || "Walk-in customer"}</p>
          <p className="mt-1 text-sm text-slate-700">{contactPhone || "No phone"}</p>
          <p className="text-sm text-slate-700">{contactEmail || "No email"}</p>
        </Card>
        <Card><p className="text-xs font-semibold uppercase text-slate-500">Dates</p><p className="mt-2 text-sm text-slate-700">Created: {quotation.quoteDate.toISOString().slice(0, 10)}</p><p className="text-sm text-slate-700">Valid until: {quotation.validUntil?.toISOString().slice(0, 10) || "-"}</p></Card>
        <Card><p className="text-xs font-semibold uppercase text-slate-500">Status</p><p className="mt-2 text-lg font-semibold text-slate-900">{quotation.status}</p><p className="text-sm text-slate-700">Total: ${Number(quotation.totalAmount).toFixed(2)}</p>{quotation.convertedSale ? <Link href={`/sales/${quotation.convertedSale.id}`} className="mt-2 inline-block text-sm text-slate-800 underline">View Sale {quotation.convertedSale.saleNumber}</Link> : null}</Card>
      </div>

      {quotation.notes ? (
        <Card className="mt-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Notes</p>
          <p className="mt-2 text-sm text-slate-700">{quotation.notes}</p>
        </Card>
      ) : null}

      <Card className="mt-4"><h2 className="mb-3 text-lg font-semibold">Line Items</h2><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="border-b border-slate-300 text-left text-slate-700"><th className="px-2 py-2">Description</th><th className="px-2 py-2">Qty</th><th className="px-2 py-2">Unit Price</th><th className="px-2 py-2">Line Total</th></tr></thead><tbody>{quotation.items.map((item) => <tr key={item.id} className="border-b border-slate-200"><td className="px-2 py-2">{item.description || item.phoneModel?.modelName || item.phoneVariant?.variantName || "Quotation item"}</td><td className="px-2 py-2">{item.quantity}</td><td className="px-2 py-2">${Number(item.unitPrice).toFixed(2)}</td><td className="px-2 py-2">${Number(item.lineTotal).toFixed(2)}</td></tr>)}{!quotation.items.length ? <tr><td colSpan={4} className="px-2 py-4 text-slate-600">No line items were added.</td></tr> : null}</tbody></table></div><div className="mt-5 ml-auto max-w-xs space-y-2 text-sm text-slate-700"><p className="flex justify-between"><span>Subtotal</span><span>${Number(quotation.subtotal).toFixed(2)}</span></p><p className="flex justify-between"><span>Tax{quotation.taxType === "Percent" ? ` (${Number(quotation.taxPercent).toFixed(2)}%)` : ""}</span><span>${Number(quotation.taxAmount).toFixed(2)}</span></p><p className="flex justify-between"><span>Handling fee</span><span>${Number(quotation.handlingFee).toFixed(2)}</span></p><p className="flex justify-between border-t border-slate-300 pt-2 text-base font-semibold text-slate-950"><span>Total</span><span>${Number(quotation.totalAmount).toFixed(2)}</span></p></div></Card>
    </div>
  );
}
