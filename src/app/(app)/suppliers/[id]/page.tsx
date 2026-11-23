import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewCost } from "@/lib/rbac";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { InfoHelp } from "@/components/ui/info-help";
import { EntityLink } from "@/components/ui/entity-link";
import { formatMoney } from "@/lib/currency";

const PAYMENT_STYLE: Record<string, string> = {
  Paid: "bg-emerald-50 text-emerald-800",
  Partial: "bg-amber-50 text-amber-900",
  Unpaid: "bg-red-50 text-red-700",
};

function Stat({ label, value, helper, tone }: { label: string; value: string; helper?: string; tone?: "good" | "bad" }) {
  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-lg font-semibold ${tone === "bad" ? "text-red-700" : tone === "good" ? "text-emerald-700" : "text-slate-900"}`}>{value}</p>
      {helper ? <p className="text-sm text-slate-600">{helper}</p> : null}
    </Card>
  );
}

export default async function SupplierDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) notFound();
  const showCost = canViewCost(session.user?.role);

  const supplier = await prisma.supplier.findUnique({
    where: { id: params.id },
    include: {
      lots: {
        where: { deletedAt: null },
        orderBy: { purchaseDate: "desc" },
        include: {
          payments: { orderBy: { paidAt: "desc" } },
          accessoryItems: { select: { unitCost: true, quantity: true, accessory: { select: { name: true } } } },
          phones: {
            where: { deletedAt: null },
            select: {
              id: true,
              status: true,
              purchasePrice: true,
              tagCost: true,
              batteryCost: true,
              repairCost: true,
              phoneVariant: { select: { phoneModel: { select: { id: true, brand: true, modelName: true } } } },
              saleItems: { select: { unitPrice: true, quantity: true, sale: { select: { status: true, saleDate: true } } } },
            },
          },
        },
      },
    },
  });
  if (!supplier) notFound();

  // Per-lot figures.
  const lots = supplier.lots.map((lot) => {
    const goods = lot.phones.reduce((sum, phone) => sum + Number(phone.purchasePrice), 0) + lot.accessoryItems.reduce((sum, item) => sum + Number(item.unitCost) * item.quantity, 0);
    const landed = Number(lot.shippingCost) + Number(lot.taxCost) + Number(lot.customsCost) + Number(lot.otherCost);
    const total = goods + landed;
    const paid = Number(lot.amountPaid);
    const perUnitLanded = lot.phones.length ? landed / lot.phones.length : 0;
    const sold = lot.phones.filter((phone) => phone.status === "Sold");
    const revenue = sold.reduce((sum, phone) => {
      const line = phone.saleItems.find((item) => item.sale.status !== "Voided");
      return sum + (line ? Number(line.unitPrice) : 0);
    }, 0);
    const soldCost = sold.reduce((sum, phone) => sum + Number(phone.purchasePrice) + Number(phone.tagCost) + Number(phone.batteryCost) + Number(phone.repairCost) + perUnitLanded, 0);
    return {
      id: lot.id,
      lotNumber: lot.lotNumber,
      date: lot.purchaseDate,
      status: lot.status,
      paymentStatus: lot.paymentStatus,
      units: lot.phones.length,
      accessories: lot.accessoryItems.reduce((sum, item) => sum + item.quantity, 0),
      inStock: lot.phones.filter((phone) => phone.status === "InStock").length,
      sold: sold.length,
      returned: lot.phones.filter((phone) => phone.status === "Returned").length,
      writtenOff: lot.phones.filter((phone) => phone.status === "WrittenOff").length,
      total,
      paid,
      remaining: Math.max(0, total - paid),
      revenue,
      profit: revenue - soldCost,
    };
  });

  const totalSpend = lots.reduce((sum, lot) => sum + lot.total, 0);
  const totalPaid = lots.reduce((sum, lot) => sum + lot.paid, 0);
  const totalOwed = lots.reduce((sum, lot) => sum + lot.remaining, 0);
  const units = lots.reduce((sum, lot) => sum + lot.units, 0);
  const sold = lots.reduce((sum, lot) => sum + lot.sold, 0);
  const inStock = lots.reduce((sum, lot) => sum + lot.inStock, 0);
  const returned = lots.reduce((sum, lot) => sum + lot.returned, 0);
  const writtenOff = lots.reduce((sum, lot) => sum + lot.writtenOff, 0);
  const revenue = lots.reduce((sum, lot) => sum + lot.revenue, 0);
  const profit = lots.reduce((sum, lot) => sum + lot.profit, 0);
  const allPhones = supplier.lots.flatMap((lot) => lot.phones);
  const avgUnitCost = allPhones.length ? allPhones.reduce((sum, phone) => sum + Number(phone.purchasePrice), 0) / allPhones.length : 0;
  const sellThrough = units ? (sold / units) * 100 : 0;
  const problemRate = sold + returned ? ((returned + writtenOff) / Math.max(1, units)) * 100 : 0;
  const lastLot = supplier.lots[0]?.purchaseDate;

  // Models sourced from this supplier.
  const modelMap = new Map<string, { id: string; label: string; units: number; sold: number; cost: number }>();
  for (const phone of allPhones) {
    const model = phone.phoneVariant.phoneModel;
    const row = modelMap.get(model.id) ?? { id: model.id, label: `${model.brand} ${model.modelName}`, units: 0, sold: 0, cost: 0 };
    row.units += 1;
    if (phone.status === "Sold") row.sold += 1;
    row.cost += Number(phone.purchasePrice);
    modelMap.set(model.id, row);
  }
  const models = Array.from(modelMap.values()).sort((a, b) => b.units - a.units);
  const modelMax = Math.max(1, ...models.map((row) => row.units));

  const payments = supplier.lots
    .flatMap((lot) => lot.payments.map((payment) => ({ ...payment, lotId: lot.id, lotNumber: lot.lotNumber })))
    .sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());

  return (
    <div>
      <PageHeader
        title={supplier.name}
        subtitle={`Supplier profile${supplier.deletedAt ? " · deleted" : ""} — lots, spend, what you still owe, and how their stock sells`}
        help={
          <p>
            Everything bought from this supplier: total spend (goods plus shipping, tax, customs and other charges), how much has been paid and is still owed, how many units
            came in and how they&apos;ve sold, the models they supply, and every payment made. Click a lot number to open that lot.
          </p>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/suppliers" className="text-sm text-slate-700 underline">Back to Suppliers</Link>
        <Link href="/lots" className="btn btn-sm btn-secondary">All lots</Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contact</p>
          <p className="mt-2 text-sm text-slate-700">{supplier.phone || "No phone"}</p>
          <p className="text-sm text-slate-700">{supplier.email || "No email"}</p>
          <p className="text-sm text-slate-700">{supplier.address || "No address"}</p>
        </Card>
        <Stat label="Total purchased" value={formatMoney(totalSpend)} helper={`${lots.length} lot${lots.length === 1 ? "" : "s"}${lastLot ? ` · last ${lastLot.toISOString().slice(0, 10)}` : ""}`} />
        <Stat label="Paid to supplier" value={formatMoney(totalPaid)} helper={`${payments.length} payment${payments.length === 1 ? "" : "s"}`} />
        <Stat label="Still owed" value={formatMoney(totalOwed)} tone={totalOwed > 0 ? "bad" : "good"} helper={`${lots.filter((lot) => lot.remaining > 0).length} lot(s) not fully paid`} />
        <Stat label="Units sourced" value={String(units)} helper={`${inStock} in stock · ${sold} sold${lots.some((lot) => lot.accessories) ? ` · ${lots.reduce((sum, lot) => sum + lot.accessories, 0)} accessories` : ""}`} />
        <Stat label="Sell-through" value={`${sellThrough.toFixed(0)}%`} helper={`${sold} of ${units} units sold`} />
        <Stat label="Returns & write-offs" value={`${returned + writtenOff}`} tone={returned + writtenOff > 0 ? "bad" : undefined} helper={`${problemRate.toFixed(1)}% of units · ${returned} returned, ${writtenOff} written off`} />
        {showCost ? (
          <Stat label="Profit on sold units" value={formatMoney(profit)} tone={profit >= 0 ? "good" : "bad"} helper={`Revenue ${formatMoney(revenue)} · avg unit cost ${formatMoney(avgUnitCost)}`} />
        ) : (
          <Stat label="Avg unit cost" value={formatMoney(avgUnitCost)} />
        )}
      </div>

      <Card className="mt-4">
        <h2 className="mb-3 flex items-center gap-1.5 text-lg font-semibold">
          Lots
          <InfoHelp size="sm" title="Lots">Every (non-deleted) lot bought from this supplier, newest first. Total includes shipping, tax, customs and other charges.</InfoHelp>
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Lot</th>
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2 text-right">Units</th>
                <th className="px-2 py-2 text-right">In stock</th>
                <th className="px-2 py-2 text-right">Sold</th>
                <th className="px-2 py-2 text-right">Total</th>
                <th className="px-2 py-2 text-right">Paid</th>
                <th className="px-2 py-2 text-right">Owed</th>
                {showCost ? <th className="px-2 py-2 text-right">Profit</th> : null}
                <th className="px-2 py-2">Payment</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => (
                <tr key={lot.id} className="border-b border-slate-100">
                  <td className="whitespace-nowrap px-2 py-2 font-medium"><Link href={`/lots/${lot.id}`} className="underline">{lot.lotNumber}</Link></td>
                  <td className="whitespace-nowrap px-2 py-2">{lot.date.toISOString().slice(0, 10)}</td>
                  <td className="px-2 py-2">{lot.status}</td>
                  <td className="px-2 py-2 text-right">{lot.units}</td>
                  <td className="px-2 py-2 text-right">{lot.inStock}</td>
                  <td className="px-2 py-2 text-right">{lot.sold}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">{formatMoney(lot.total)}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">{formatMoney(lot.paid)}</td>
                  <td className={`whitespace-nowrap px-2 py-2 text-right font-medium ${lot.remaining > 0 ? "text-red-700" : "text-slate-500"}`}>{formatMoney(lot.remaining)}</td>
                  {showCost ? <td className={`whitespace-nowrap px-2 py-2 text-right ${lot.profit >= 0 ? "text-emerald-700" : "text-red-700"}`}>{lot.sold ? formatMoney(lot.profit) : "—"}</td> : null}
                  <td className="px-2 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PAYMENT_STYLE[lot.paymentStatus] ?? "bg-slate-100 text-slate-700"}`}>{lot.paymentStatus}</span></td>
                </tr>
              ))}
              {!lots.length ? (
                <tr>
                  <td colSpan={showCost ? 11 : 10} className="px-2 py-4 text-slate-600">No lots from this supplier yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card className="min-w-0">
          <h2 className="mb-3 flex items-center gap-1.5 text-lg font-semibold">
            Models supplied
            <InfoHelp size="sm" title="Models supplied">Phone models bought from this supplier, most units first, with how many sold and the average purchase price.</InfoHelp>
          </h2>
          {models.length ? (
            <ul className="grid gap-2.5 text-sm">
              {models.map((row) => (
                <li key={row.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate"><EntityLink kind="model" id={row.id}>{row.label}</EntityLink></span>
                    <span className="shrink-0 text-xs text-slate-600">
                      <span className="font-semibold text-slate-900">{row.units}</span> units · {row.sold} sold · avg {formatMoney(row.cost / row.units)}
                    </span>
                  </div>
                  <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full bg-[#1baf7a]" style={{ width: `${(row.sold / modelMax) * 100}%` }} title={`${row.sold} sold`} />
                    <div className="h-full bg-[#2a78d6]" style={{ width: `${((row.units - row.sold) / modelMax) * 100}%` }} title={`${row.units - row.sold} not sold`} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No phones from this supplier yet.</p>
          )}
          {models.length ? (
            <p className="mt-3 flex gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full bg-[#1baf7a]" /> Sold</span>
              <span className="flex items-center gap-1"><span className="inline-block size-2 rounded-full bg-[#2a78d6]" /> Not sold</span>
            </p>
          ) : null}
        </Card>

        <Card className="min-w-0">
          <h2 className="mb-3 flex items-center gap-1.5 text-lg font-semibold">
            Payments to supplier
            <InfoHelp size="sm" title="Payments to supplier">Every payment recorded against this supplier&apos;s lots, newest first. Record new payments on the lot page.</InfoHelp>
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Lot</th>
                  <th className="px-2 py-2">Method</th>
                  <th className="px-2 py-2">Reference</th>
                  <th className="px-2 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-slate-100">
                    <td className="whitespace-nowrap px-2 py-2">{payment.paidAt.toISOString().slice(0, 10)}</td>
                    <td className="whitespace-nowrap px-2 py-2"><Link href={`/lots/${payment.lotId}`} className="underline">{payment.lotNumber}</Link></td>
                    <td className="px-2 py-2">{payment.method ?? "—"}</td>
                    <td className="px-2 py-2">{payment.reference ?? "—"}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-medium">{formatMoney(payment.amount)}</td>
                  </tr>
                ))}
                {!payments.length ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-4 text-slate-600">No payments recorded yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
