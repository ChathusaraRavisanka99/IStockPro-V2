import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { DashboardWidgetLayout } from "@/components/dashboard/dashboard-widget-layout";

export default async function DashboardPage() {
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
      <PageHeader title="Dashboard" subtitle="Business overview and stock health" />
      <DashboardWidgetLayout widgets={[
        { id: "monthly-sales", title: "Monthly Sales", value: `$${monthSales.toFixed(2)}`, helper: "Completed sales in current month" },
        { id: "pending-invoices", title: "Invoices Pending", value: String(pendingInvoices), helper: "Unpaid and partially paid invoices" },
        { id: "in-stock-phones", title: "In-Stock Phones", value: String(inStockPhones), helper: "Serialized units currently available" },
        { id: "low-stock", title: "Low Stock Alerts", value: String(lowStockTotal), helper: "Models and accessories below thresholds" },
        { id: "sales-count", title: "Completed Sales", value: String(completedSales), helper: "All-time completed transactions" },
        { id: "returns-count", title: "Returns", value: String(returnsCount), helper: "All recorded returns" },
        { id: "inventory-value", title: "Inventory Value", value: `$${Number(inventoryValue._sum.purchasePrice ?? 0).toFixed(2)}`, helper: "Cost of in-stock phones" },
        { id: "accessory-stock", title: "Accessory Stock", value: String(accessories.reduce((sum, item) => sum + item.quantity, 0)), helper: "Units across accessory categories" },
      ]} />

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <DataTableShell title="Top Stock Models">
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
        <DataTableShell title="Low Stock Watchlist">
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
