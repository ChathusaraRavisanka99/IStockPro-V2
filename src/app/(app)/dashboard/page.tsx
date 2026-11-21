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
    { id: "pending-invoices", title: "Invoices pending", value: String(pendingInvoices), icon: "invoices", attention: pendingInvoices > 0, helper: "Unpaid or partially paid", href: "/sales?filter2=Unpaid" },
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
        <DataTableShell title="Top sellers" help="Best-selling phone variants and accessories over the last 30 days, by revenue.">
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

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <DataTableShell title="Recent sales" help="The latest completed sales." toolbar={<Link href="/sales" className="text-sm text-slate-600 underline">All sales</Link>}>
          {insights.recentSales.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {insights.recentSales.map((sale) => (
                <li key={sale.id}>
                  <Link href={`/sales/${sale.id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition hover:bg-slate-50">
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

        <DataTableShell title="Most stock on hand" help="Phone models with the most in-stock units right now.">
          {topStock.length ? (
            <ul className="grid gap-2.5 text-sm">
              {topStock.map((row) => (
                <li key={row.id}>
                  <div className="flex justify-between gap-3">
                    <span className="truncate text-slate-800">{row.label}</span>
                    <span className="font-semibold text-slate-900">{row.inStock}</span>
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
          <DataTableShell title={`Low stock watchlist${lowStockTotal ? ` (${lowStockTotal})` : ""}`} help="Phone models and accessories at or below their low-stock threshold — time to reorder. Most urgent first.">
            {lowStockTotal ? (
              <ul className="grid gap-2 text-sm">
                {[...lowStockPhoneModels.map((row) => ({ ...row, kind: "Phone" })), ...lowStockAccessories.map((row) => ({ ...row, kind: "Accessory" }))].map((row) => (
                  <li key={row.kind + row.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-slate-800">{row.label}</span>
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
