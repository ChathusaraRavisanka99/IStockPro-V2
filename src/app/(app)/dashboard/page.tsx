import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { DataTableShell } from "@/components/ui/data-table-shell";
import Link from "next/link";
import { BarChart3, FileText, Layers, ShoppingCart, Smartphone } from "lucide-react";
import { DashboardWidgetLayout, type DashboardWidget } from "@/components/dashboard/dashboard-widget-layout";
import { SalesTrendChart } from "@/components/dashboard/sales-trend-chart";
import { getDashboardInsights } from "@/lib/dashboard";
import { formatMoney } from "@/lib/currency";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canViewCost } from "@/lib/rbac";
import { LotAnalytics, type LotAnalyticsRow, type LotSort } from "@/components/dashboard/lot-analytics";
import { EntityLink } from "@/components/ui/entity-link";

const LOT_SORTS: LotSort[] = ["recent", "sell-through", "stock", "outstanding", "age"];

export default async function DashboardPage({ searchParams }: { searchParams?: { lotSort?: string } }) {
  const session = await getServerSession(authOptions);
  const showCost = canViewCost(session?.user?.role as "admin" | "manager" | "staff" | undefined);
  const requestedSort = LOT_SORTS.includes(searchParams?.lotSort as LotSort) ? (searchParams?.lotSort as LotSort) : "recent";
  const lotSort: LotSort = requestedSort === "outstanding" && !showCost ? "recent" : requestedSort;
  const [, pendingInvoices, inStockPhones, phoneModels, accessories, completedSales, returnsCount, inventoryValue] = await Promise.all([
    prisma.sale.aggregate({
      _sum: { totalAmount: true },
      where: {
        status: "Completed",
        saleDate: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        },
      },
    }),
    prisma.invoice.count({
      where: { status: { in: ["Unpaid", "PartiallyPaid"] } },
    }),
    prisma.phone.count({ where: { status: "InStock", deletedAt: null } }),
    prisma.phoneModel.findMany({
      where: { deletedAt: null },
      include: {
        variants: {
          where: { deletedAt: null },
          include: {
            _count: {
              select: {
                phones: {
                  where: { status: "InStock", deletedAt: null },
                },
              },
            },
          },
        },
      },
    }),
    prisma.accessory.findMany({ where: { deletedAt: null } }),
    prisma.sale.count({ where: { status: "Completed" } }),
    prisma.return.count(),
    prisma.phone.aggregate({ _sum: { purchasePrice: true }, where: { deletedAt: null, status: "InStock" } }),
  ]);

  const lotRecords = await prisma.lot.findMany({
    where: { deletedAt: null },
    orderBy: { purchaseDate: "desc" },
    take: 300,
    include: {
      supplier: { select: { name: true } },
      phones: { where: { deletedAt: null }, select: { status: true, purchasePrice: true } },
      accessoryItems: { select: { unitCost: true, quantity: true } },
      bookmarks: { where: { userId: session?.user?.id ?? "" }, select: { userId: true } },
    },
  });
  const lotRows: LotAnalyticsRow[] = lotRecords.map((lot) => ({
    id: lot.id,
    lotNumber: lot.lotNumber,
    supplier: lot.supplier.name,
    status: lot.status,
    paymentStatus: lot.paymentStatus,
    bookmarked: lot.bookmarks.length > 0,
    units: lot.phones.length,
    inStock: lot.phones.filter((phone) => phone.status === "InStock").length,
    sold: lot.phones.filter((phone) => phone.status === "Sold").length,
    totalCost:
      Number(lot.shippingCost) + Number(lot.taxCost) + Number(lot.customsCost) + Number(lot.otherCost) +
      lot.phones.reduce((sum, phone) => sum + Number(phone.purchasePrice), 0) +
      lot.accessoryItems.reduce((sum, item) => sum + Number(item.unitCost) * item.quantity, 0),
    paid: Number(lot.amountPaid),
    ageDays: Math.max(0, Math.floor((Date.now() - lot.purchaseDate.getTime()) / 86_400_000)),
  }));

  const insights = await getDashboardInsights();

  // Money still owed on sales: every unpaid / part-paid invoice on a non-voided sale.
  const openInvoices = await prisma.invoice.findMany({
    where: { status: { in: ["Unpaid", "PartiallyPaid"] }, sale: { status: { not: "Voided" } } },
    select: {
      invoiceNumber: true,
      totalAmount: true,
      paidAmount: true,
      dueDate: true,
      sale: { select: { id: true, saleNumber: true, saleDate: true, customerId: true, customer: { select: { name: true, phone: true } } } },
    },
  });
  const unpaidSales = openInvoices
    .map((invoice) => ({
      saleId: invoice.sale.id,
      saleNumber: invoice.sale.saleNumber,
      customerId: invoice.sale.customerId,
      customer: invoice.sale.customer?.name ?? null,
      paid: Number(invoice.paidAmount),
      due: Math.max(0, Number(invoice.totalAmount) - Number(invoice.paidAmount)),
      ageDays: Math.max(0, Math.floor((Date.now() - invoice.sale.saleDate.getTime()) / 86_400_000)),
      overdue: Boolean(invoice.dueDate && invoice.dueDate.getTime() < Date.now()),
    }))
    .filter((row) => row.due > 0.004)
    .sort((a, b) => b.ageDays - a.ageDays || b.due - a.due);
  const unpaidTotal = unpaidSales.reduce((sum, row) => sum + row.due, 0);
  const debtorMap = new Map<string, { customerId: string | null; name: string; phone: string | null; due: number; sales: number; oldestDays: number }>();
  for (const invoice of openInvoices) {
    const due = Math.max(0, Number(invoice.totalAmount) - Number(invoice.paidAmount));
    if (due <= 0.004) continue;
    const key = invoice.sale.customerId ?? "walk-in";
    const entry = debtorMap.get(key) ?? { customerId: invoice.sale.customerId, name: invoice.sale.customer?.name ?? "Walk-in (no customer)", phone: invoice.sale.customer?.phone ?? null, due: 0, sales: 0, oldestDays: 0 };
    entry.due += due;
    entry.sales += 1;
    entry.oldestDays = Math.max(entry.oldestDays, Math.floor((Date.now() - invoice.sale.saleDate.getTime()) / 86_400_000));
    debtorMap.set(key, entry);
  }
  const debtors = Array.from(debtorMap.values()).sort((a, b) => b.due - a.due);
  const debtorMax = Math.max(1, ...debtors.map((row) => row.due));

  const lowStockPhoneModels = phoneModels
    .map((model) => ({ id: model.id, label: `${model.brand} ${model.modelName}`, inStock: model.variants.reduce((acc, variant) => acc + variant._count.phones, 0), threshold: model.lowStockThreshold }))
    .filter((model) => model.inStock <= model.threshold)
    .sort((a, b) => a.inStock / Math.max(1, a.threshold) - b.inStock / Math.max(1, b.threshold));
  const lowStockAccessories = accessories
    .filter((item) => item.quantity <= item.lowStockThreshold)
    .map((item) => ({ id: item.id, label: item.name, inStock: item.quantity, threshold: item.lowStockThreshold }));
  const lowStockTotal = lowStockPhoneModels.length + lowStockAccessories.length;

  const topStock = phoneModels
    .map((model) => ({ id: model.id, label: `${model.brand} ${model.modelName}`, inStock: model.variants.reduce((acc, variant) => acc + variant._count.phones, 0) }))
    .filter((model) => model.inStock > 0)
    .sort((a, b) => b.inStock - a.inStock)
    .slice(0, 6);
  const topStockMax = Math.max(1, ...topStock.map((row) => row.inStock));
  const topSellerMax = Math.max(1, ...insights.topSellers.map((row) => row.revenue));

  const name = session?.user?.name || session?.user?.username || "";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const widgets: DashboardWidget[] = [
    { id: "monthly-sales", title: "Sales this month", value: formatMoney(insights.month.revenue), icon: "sales", change: insights.month.revenueChange, changeLabel: "vs same days last month", helper: `${insights.month.sales} sale${insights.month.sales === 1 ? "" : "s"} · avg ${formatMoney(insights.month.avgSale)}`, href: "/sales" },
    ...(showCost
      ? [{ id: "monthly-profit", title: "Gross profit this month", value: formatMoney(insights.month.profit), icon: "profit" as const, change: insights.month.profitChange, changeLabel: "vs same days last month", helper: insights.month.margin !== null ? `${insights.month.margin.toFixed(1)}% margin` : "No sales yet this month", href: "/reports" }]
      : []),
    { id: "in-stock-phones", title: "Phones in stock", value: String(inStockPhones), icon: "phones", helper: `Retail value ${formatMoney(insights.stockRetailValue)}`, href: "/items/phones?filter=InStock" },
    { id: "low-stock", title: "Low stock alerts", value: String(lowStockTotal), icon: "alert", attention: lowStockTotal > 0, helper: lowStockTotal ? "Models/accessories at or below threshold" : "All stock above thresholds", href: "#low-stock" },
    { id: "pending-invoices", title: "Invoices pending", value: String(pendingInvoices), icon: "invoices", attention: pendingInvoices > 0, helper: unpaidTotal > 0 ? `${formatMoney(unpaidTotal)} still owed` : "Unpaid or partially paid", href: "#unpaid" },
    { id: "sales-count", title: "Completed sales", value: String(completedSales), icon: "receipt", helper: "All time", href: "/sales" },
    { id: "returns-count", title: "Returns", value: String(returnsCount), icon: "returns", helper: "All recorded returns", href: "/returns" },
    ...(showCost ? [{ id: "inventory-value", title: "Inventory cost", value: formatMoney(Number(inventoryValue._sum.purchasePrice ?? 0)), icon: "value" as const, helper: "Purchase cost of in-stock phones" }] : []),
    { id: "accessory-stock", title: "Accessory stock", value: String(accessories.reduce((sum, item) => sum + item.quantity, 0)), icon: "accessories", helper: "Units across all categories", href: "/items/chargers" },
  ];

  const quickActions = [
    { href: "/sales", label: "New sale", icon: ShoppingCart, primary: true },
    { href: "/quotations", label: "New quotation", icon: FileText },
    { href: "/lots", label: "Lots", icon: Layers },
    { href: "/items/phones", label: "Phones", icon: Smartphone },
    { href: "/reports", label: "Reports", icon: BarChart3 },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <PageHeader
          title={name ? `${greeting}, ${name.split(" ")[0]}` : "Dashboard"}
          subtitle={today}
          help={
            <>
              <p>A live snapshot of the business: this month&apos;s sales compared with the same number of days last month, the last 30 days of sales, what&apos;s selling, lot progress, and stock that needs attention.</p>
              <p>Click a tile to jump to the details. Use Customize to reorder or hide tiles — that&apos;s remembered in this browser. For date-filtered financial reports, see Reports.</p>
            </>
          }
        />
        <div className="flex flex-wrap gap-2 print:hidden">
          {quickActions.map((action) => (
            <Link
              key={action.href + action.label}
              href={action.href}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${action.primary ? "bg-slate-900 text-white hover:bg-slate-800" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              <action.icon className="size-4" />
              {action.label}
            </Link>
          ))}
        </div>
      </div>

      <DashboardWidgetLayout widgets={widgets} />

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <DataTableShell
            title="Sales — last 30 days"
            help={showCost ? "Daily revenue from completed sales (bars) and gross profit after the cost of the goods sold (line). Hover a day for details." : "Daily revenue from completed sales. Hover a day for details."}
            toolbar={
              <span className="text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{formatMoney(insights.trendTotals.revenue)}</span> · {insights.trendTotals.sales} sales
              </span>
            }
          >
            <SalesTrendChart data={insights.trend} showProfit={showCost} />
          </DataTableShell>
        </div>
        <DataTableShell title="Top sellers" help="Best-selling phone variants and accessories over the last 30 days, by revenue." toolbar={<Link href="/reports" className="text-sm text-slate-600 underline">Reports</Link>}>
          {insights.topSellers.length ? (
            <ol className="grid gap-3 text-sm">
              {insights.topSellers.map((row, index) => (
                <li key={row.label}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-slate-800" title={row.label}>
                      <span className="mr-1.5 text-xs text-slate-400">{index + 1}</span>
                      {row.label}
                    </span>
                    <span className="shrink-0 font-medium text-slate-900">{formatMoney(row.revenue)}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${(row.revenue / topSellerMax) * 100}%` }} />
                    </div>
                    <span className="w-12 text-right text-xs text-slate-500">{row.qty} sold</span>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-slate-500">No sales in the last 30 days.</p>
          )}
        </DataTableShell>
      </div>

      <LotAnalytics lots={lotRows} showCost={showCost} sort={lotSort} />

      <div id="unpaid" className="mt-6 grid scroll-mt-6 gap-4 xl:grid-cols-2">
        <DataTableShell
          title={`Unpaid sales${unpaidSales.length ? ` (${unpaidSales.length})` : ""}`}
          help="Sales whose invoice is unpaid or only partly paid (voided sales excluded), oldest first. Click the sale number for a quick look; open it from there to record a payment."
          toolbar={
            <>
              <span className="text-sm text-slate-600">Owed <span className="font-semibold text-slate-900">{formatMoney(unpaidTotal)}</span></span>
              <Link href="/sales?filter2=Unpaid" className="text-sm text-slate-600 underline">All</Link>
            </>
          }
        >
          {unpaidSales.length ? (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">Sale</th>
                  <th className="px-2 py-2">Customer</th>
                  <th className="px-2 py-2 text-right">Paid</th>
                  <th className="px-2 py-2 text-right">Due</th>
                  <th className="px-2 py-2 text-right">Age</th>
                </tr>
              </thead>
              <tbody>
                {unpaidSales.slice(0, 10).map((row) => (
                  <tr key={row.saleId} className="border-b border-slate-100">
                    <td className="whitespace-nowrap px-2 py-2 font-medium"><EntityLink kind="sale" id={row.saleId}>{row.saleNumber}</EntityLink></td>
                    <td className="px-2 py-2">{row.customerId ? <EntityLink kind="customer" id={row.customerId}>{row.customer ?? "Customer"}</EntityLink> : <span className="text-slate-500">Walk-in</span>}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right text-slate-600" data-sort={row.paid}>{formatMoney(row.paid)}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-semibold text-slate-900" data-sort={row.due}>{formatMoney(row.due)}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right" data-sort={row.ageDays}>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${row.overdue || row.ageDays > 30 ? "bg-red-50 text-red-700" : row.ageDays > 7 ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
                        {row.ageDays}d{row.overdue ? " · overdue" : ""}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-slate-500">✓ Every sale is fully paid.</p>
          )}
          {unpaidSales.length > 10 ? (
            <p className="mt-2 text-xs text-slate-500">
              Showing the 10 oldest of {unpaidSales.length}. <Link href="/sales?filter2=Unpaid" className="underline">See all unpaid sales</Link>
            </p>
          ) : null}
        </DataTableShell>

        <DataTableShell
          title={`Customers who owe${debtors.length ? ` (${debtors.length})` : ""}`}
          help="Customers with unpaid or part-paid sales, biggest balance first. Click a name to see the customer and their contact details."
          toolbar={<Link href="/customers" className="text-sm text-slate-600 underline">Customers</Link>}
        >
          {debtors.length ? (
            <ul className="grid gap-2.5 text-sm">
              {debtors.slice(0, 10).map((row) => (
                <li key={row.customerId ?? "walk-in"}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">
                      {row.customerId ? <EntityLink kind="customer" id={row.customerId}>{row.name}</EntityLink> : <span className="text-slate-600">{row.name}</span>}
                      <span className="ml-1.5 text-xs text-slate-500">
                        {row.sales} sale{row.sales === 1 ? "" : "s"} · oldest {row.oldestDays}d{row.phone ? ` · ${row.phone}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold text-slate-900">{formatMoney(row.due)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${row.oldestDays > 30 ? "bg-[#e5484d]" : "bg-[#f5a524]"}`} style={{ width: `${(row.due / debtorMax) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">✓ No customer owes anything.</p>
          )}
        </DataTableShell>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <DataTableShell title="Recent sales" help="The latest completed sales." toolbar={<Link href="/sales" className="text-sm text-slate-600 underline">All sales</Link>}>
          {insights.recentSales.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {insights.recentSales.map((sale) => (
                <li key={sale.id}>
                  <Link href={`/sales/${sale.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">{sale.customer}</span>
                      <span className="text-xs text-slate-500">
                        {sale.saleNumber} · {sale.items} item{sale.items === 1 ? "" : "s"} · {new Date(sale.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        {sale.saleType === "Wholesale" ? " · Wholesale" : ""}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold text-slate-900">{formatMoney(sale.total)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No sales yet.</p>
          )}
        </DataTableShell>

        <DataTableShell title="Most stock on hand" help="Phone models with the most in-stock units right now. Click a model for its details, or the number to list those units." toolbar={<Link href="/items/phone-catalog" className="text-sm text-slate-600 underline">Catalog</Link>}>
          {topStock.length ? (
            <ul className="grid gap-2.5 text-sm">
              {topStock.map((row) => (
                <li key={row.id}>
                  <div className="flex justify-between gap-3">
                    <span className="min-w-0 truncate text-slate-800"><EntityLink kind="model" id={row.id}>{row.label}</EntityLink></span>
                    <Link href={`/items/phones?filter=InStock&model=${encodeURIComponent(row.label)}`} className="font-semibold text-slate-900 hover:underline" title="See these units">{row.inStock}</Link>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-[#1baf7a]" style={{ width: `${(row.inStock / topStockMax) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No phones in stock.</p>
          )}
        </DataTableShell>

        <div id="low-stock" className="scroll-mt-6">
          <DataTableShell title={`Low stock watchlist${lowStockTotal ? ` (${lowStockTotal})` : ""}`} help="Phone models and accessories at or below their low-stock threshold — time to reorder. Most urgent first. Click a name to see its details." toolbar={<Link href="/lots" className="text-sm text-slate-600 underline">Lots</Link>}>
            {lowStockTotal ? (
              <ul className="grid gap-2 text-sm">
                {[...lowStockPhoneModels.map((row) => ({ ...row, kind: "Phone" })), ...lowStockAccessories.map((row) => ({ ...row, kind: "Accessory" }))].map((row) => (
                  <li key={row.kind + row.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-slate-800"><EntityLink kind={row.kind === "Phone" ? "model" : "accessory"} id={row.id}>{row.label}</EntityLink></span>
                      <span className="text-xs text-slate-500">{row.kind} · threshold {row.threshold}</span>
                    </span>
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${row.inStock === 0 ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}>
                      {row.inStock === 0 ? "✕ Out of stock" : `⚠ ${row.inStock} left`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">✓ Nothing is running low.</p>
            )}
          </DataTableShell>
        </div>
      </div>
    </div>
  );
}
