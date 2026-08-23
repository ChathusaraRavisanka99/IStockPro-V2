import { StatCard } from "@/components/ui/stat-card";
import { PageHeader } from "@/components/ui/page-header";
import { DataTableShell } from "@/components/ui/data-table-shell";

export default function DashboardPage() {
  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Business overview and stock health" />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Monthly Sales" value="$0" helper="TODO: wire Prisma aggregation" />
        <StatCard label="Invoices Pending" value="0" helper="TODO: connect invoice statuses" />
        <StatCard label="In-Stock Phones" value="0" helper="TODO: include variant/model grouping" />
        <StatCard label="Low Stock Alerts" value="0" helper="TODO: use model/accessory thresholds" />
      </section>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <DataTableShell title="SalesChart TODO">
          <div className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-600 dark:border-slate-600 dark:text-slate-300">
            Replace placeholder chart with Recharts monthly sales data.
          </div>
        </DataTableShell>
        <DataTableShell title="StockChart TODO">
          <div className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-600 dark:border-slate-600 dark:text-slate-300">
            Replace placeholder chart with live stock by model/accessory category.
          </div>
        </DataTableShell>
      </div>
    </div>
  );
}
