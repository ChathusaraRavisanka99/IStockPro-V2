import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { DashboardWidgetLayout } from "@/components/dashboard/dashboard-widget-layout";
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
  const [monthlySalesAgg, pendingInvoices, inStockPhones, phoneModels, accessories, completedSales, returnsCount, inventoryValue] = await Promise.all([
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

  const lowStockPhoneModels = phoneModels.filter((model) => {
    const inStock = model.variants.reduce((acc, variant) => acc + variant._count.phones, 0);
    return inStock <= model.lowStockThreshold;
  });

  const lowStockAccessories = accessories.filter((item) => item.quantity <= item.lowStockThreshold);
  const lowStockTotal = lowStockPhoneModels.length + lowStockAccessories.length;

  const topStock = phoneModels
    .map((model) => ({
      id: model.id,
      label: `${model.brand} ${model.modelName}`,
      inStock: model.variants.reduce((acc, variant) => acc + variant._count.phones, 0),
    }))
    .sort((a, b) => b.inStock - a.inStock)
    .slice(0, 5);

  const monthSales = Number(monthlySalesAgg._sum.totalAmount ?? 0);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Business overview and stock health"
        help={
          <p>
            A quick snapshot of the business: sales this month, invoices still owed, current stock levels, and anything
            running low. The tiles are all-time or current-month figures — for date-filtered financial reports, see the
            Reports page.
          </p>
        }
      />
      <DashboardWidgetLayout widgets={[
        { id: "monthly-sales", title: "Monthly Sales", value: formatMoney(monthSales), helper: "Completed sales in current month" },
        { id: "pending-invoices", title: "Invoices Pending", value: String(pendingInvoices), helper: "Unpaid and partially paid invoices" },
        { id: "in-stock-phones", title: "In-Stock Phones", value: String(inStockPhones), helper: "Serialized units currently available" },
        { id: "low-stock", title: "Low Stock Alerts", value: String(lowStockTotal), helper: "Models and accessories below thresholds" },
        { id: "sales-count", title: "Completed Sales", value: String(completedSales), helper: "All-time completed transactions" },
        { id: "returns-count", title: "Returns", value: String(returnsCount), helper: "All recorded returns" },
        { id: "inventory-value", title: "Inventory Value", value: formatMoney(Number(inventoryValue._sum.purchasePrice ?? 0)), helper: "Cost of in-stock phones" },
        { id: "accessory-stock", title: "Accessory Stock", value: String(accessories.reduce((sum, item) => sum + item.quantity, 0)), helper: "Units across accessory categories" },
      ]} />

      <LotAnalytics lots={lotRows} showCost={showCost} sort={lotSort} />

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <DataTableShell title="Top Stock Models" help="The 5 phone models with the most in-stock units right now, highest first.">
          <div className="space-y-2 text-sm">
            {topStock.map((row) => (
              <div key={row.id} className="flex items-center justify-between rounded-lg border border-slate-300 px-3 py-2">
                <span>{row.label}</span>
                <span className="font-semibold">{row.inStock}</span>
              </div>
            ))}
            {!topStock.length ? <p className="text-slate-600">No model stock data available yet.</p> : null}
          </div>
        </DataTableShell>
        <DataTableShell title="Low Stock Watchlist" help="Phone models and accessories whose in-stock quantity has fallen at or below their configured low-stock threshold — a signal it's time to reorder.">
          <div className="space-y-2 text-sm">
            {lowStockPhoneModels.map((model) => {
              const inStock = model.variants.reduce((acc, variant) => acc + variant._count.phones, 0);
              return (
                <div key={model.id} className="flex items-center justify-between rounded-lg border border-slate-300 px-3 py-2">
                  <span>{model.brand + " " + model.modelName}</span>
                  <span>
                    {inStock} / threshold {model.lowStockThreshold}
                  </span>
                </div>
              );
            })}
            {lowStockAccessories.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-lg border border-slate-300 px-3 py-2">
                <span>{item.name}</span>
                <span>
                  {item.quantity} / threshold {item.lowStockThreshold}
                </span>
              </div>
            ))}
            {!lowStockPhoneModels.length && !lowStockAccessories.length ? (
              <p className="text-slate-600">No low stock alerts right now.</p>
            ) : null}
          </div>
        </DataTableShell>
      </div>
    </div>
  );
}
