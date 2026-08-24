import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ReceiptActions } from "@/components/sales/receipt-actions";

export default async function ReceiptPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) notFound();

  const sale = await prisma.sale.findUnique({
    where: { id: params.id },
    include: { customer: true, invoice: true, items: { include: { phone: true, accessory: true } } },
  });
  if (!sale) notFound();

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href="/sales" className="text-sm text-slate-700 underline">Back to Sales</Link>
        <ReceiptActions saleId={sale.id} fileName={sale.invoice?.invoiceNumber || sale.saleNumber} />
      </div>
      <section className="receipt-paper rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-start justify-between border-b border-slate-200 pb-5">
          <div><h1 className="text-2xl font-semibold text-slate-950">IStockPro</h1><p className="text-sm text-slate-600">Sales receipt</p></div>
          <div className="text-right text-sm text-slate-700"><p className="font-semibold text-slate-950">{sale.saleNumber}</p><p>{sale.saleDate.toISOString().slice(0, 10)}</p></div>
        </div>
        <div className="grid gap-2 border-b border-slate-200 py-5 text-sm text-slate-700 sm:grid-cols-2">
          <p><span className="font-semibold text-slate-950">Customer:</span> {sale.customer?.name || "Walk-in customer"}</p>
          <p><span className="font-semibold text-slate-950">Invoice:</span> {sale.invoice?.invoiceNumber || "-"}</p>
        </div>
        <table className="mt-5 min-w-full text-sm">
          <thead><tr className="border-b border-slate-300 text-left text-slate-700"><th className="py-2">Item</th><th className="py-2">Qty</th><th className="py-2 text-right">Amount</th></tr></thead>
          <tbody>
            {sale.items.map((item) => <tr key={item.id} className="border-b border-slate-200"><td className="py-3">{item.phone?.imei || item.accessory?.name || "Sale item"}</td><td className="py-3">{item.quantity}</td><td className="py-3 text-right">${Number(item.lineTotal).toFixed(2)}</td></tr>)}
            {!sale.items.length ? <tr><td className="py-3 text-slate-600" colSpan={3}>Summary sale without item lines</td></tr> : null}
          </tbody>
        </table>
        <div className="ml-auto mt-6 max-w-xs space-y-2 text-sm text-slate-700">
          <p className="flex justify-between"><span>Subtotal</span><span>${Number(sale.subtotal).toFixed(2)}</span></p>
          <p className="flex justify-between"><span>Tax{sale.taxType === "Percent" ? ` (${Number(sale.taxPercent).toFixed(2)}%)` : ""}</span><span>${Number(sale.taxAmount).toFixed(2)}</span></p>
          {Number(sale.handlingFee) > 0 ? <p className="flex justify-between"><span>Handling fee</span><span>${Number(sale.handlingFee).toFixed(2)}</span></p> : null}
          <p className="flex justify-between"><span>Discount</span><span>-${Number(sale.discount).toFixed(2)}</span></p>
          <p className="flex justify-between border-t border-slate-300 pt-2 text-base font-semibold text-slate-950"><span>Total</span><span>${Number(sale.totalAmount).toFixed(2)}</span></p>
        </div>
        <p className="mt-8 text-center text-xs text-slate-500">Thank you for your business.</p>
      </section>
    </main>
  );
}
