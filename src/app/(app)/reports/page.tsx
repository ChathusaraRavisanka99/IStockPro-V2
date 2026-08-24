import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canViewCost } from "@/lib/rbac";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { computeReportData } from "@/lib/reports";

const AGING_DAYS = 60;

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseRange(searchParams?: { from?: string; to?: string }) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const from = searchParams?.from ? new Date(`${searchParams.from}T00:00:00`) : monthStart;
  const to = searchParams?.to ? new Date(`${searchParams.to}T23:59:59.999`) : now;
  return { from, to };
}

export default async function ReportsPage({ searchParams }: { searchParams?: { from?: string; to?: string } }) {
  const session = await getServerSession(authOptions);
  const allowed = canViewCost(session?.user?.role as "admin" | "manager" | "staff" | undefined);

  if (!allowed) {
    return (
      <div>
        <PageHeader title="Reports" subtitle="Finance reports are restricted to manager and admin roles" />
        <Card>
          <p className="text-sm text-slate-700">You do not have permission to access P&L and cost analysis reports.</p>
        </Card>
      </div>
    );
  }

  const { from, to } = parseRange(searchParams);
  const data = await computeReportData(from, to);
  const { financial: f, inventory: inv, salesByItem } = data;
  const exportQuery = new URLSearchParams({ from: toDateInputValue(from), to: toDateInputValue(to) }).toString();

  return (
    <div>
      <PageHeader title="Reports" subtitle="Financial performance and inventory management analysis" />

      <Card className="mb-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="grid min-w-0 gap-1 text-xs text-slate-600">
            From
            <input type="date" name="from" defaultValue={toDateInputValue(from)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
          </label>
          <label className="grid min-w-0 gap-1 text-xs text-slate-600">
            To
            <input type="date" name="to" defaultValue={toDateInputValue(to)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
          </label>
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">Apply Range</button>
          <a href={`/api/reports/export?${exportQuery}`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-800">Download Report</a>
        </form>
      </Card>

      <h2 className="mb-2 mt-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Financial Overview ({toDateInputValue(from)} to {toDateInputValue(to)})</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-sm font-medium text-slate-700">Revenue</p>
          <p className="mt-2 text-3xl font-semibold">${f.revenue.toFixed(2)}</p>
          <p className="mt-1 text-xs text-slate-600">{f.completedSaleCount} completed sales · avg ${f.avgSaleValue.toFixed(2)}</p>
        </Card>
        <Card>
          <p className="text-sm font-medium text-slate-700">Quotation Totals</p>
          <p className="mt-2 text-3xl font-semibold">${f.quotationTotals.toFixed(2)}</p>
          <p className="mt-1 text-xs text-slate-600">{f.quotationCount} quotations issued</p>
        </Card>
        <Card>
          <p className="text-sm font-medium text-slate-700">Cost of Goods Sold</p>
          <p className="mt-2 text-3xl font-semibold">${f.cogs.toFixed(2)}</p>
          <p className="mt-1 text-xs text-slate-600">Phones ${f.phoneCogs.toFixed(2)} · Accessories ${f.accessoryCogs.toFixed(2)}</p>
        </Card>
        <Card>
          <p className="text-sm font-medium text-slate-700">Gross Profit</p>
          <p className="mt-2 text-3xl font-semibold">${f.grossProfit.toFixed(2)}</p>
          <p className="mt-1 text-xs text-slate-600">{f.grossMargin.toFixed(1)}% margin</p>
        </Card>
        <Card>
          <p className="text-sm font-medium text-slate-700">Net Profit</p>
          <p className="mt-2 text-3xl font-semibold">${f.netProfit.toFixed(2)}</p>
          <p className="mt-1 text-xs text-slate-600">{f.netMargin.toFixed(1)}% margin, after expenses/tax/refunds</p>
        </Card>
        <Card>
          <p className="text-sm font-medium text-slate-700">Operating Expenses</p>
          <p className="mt-2 text-2xl font-semibold">${f.expenses.toFixed(2)}</p>
        </Card>
        <Card>
          <p className="text-sm font-medium text-slate-700">Taxes Paid</p>
          <p className="mt-2 text-2xl font-semibold">${f.taxes.toFixed(2)}</p>
        </Card>
        <Card>
          <p className="text-sm font-medium text-slate-700">Refunds Issued</p>
          <p className="mt-2 text-2xl font-semibold">${f.refunds.toFixed(2)}</p>
          <p className="mt-1 text-xs text-slate-600">{f.returnCountInPeriod} returns · {f.returnRate.toFixed(1)}% return rate</p>
        </Card>
        <Card>
          <p className="text-sm font-medium text-slate-700">This Month vs Last</p>
          <p className="mt-2 text-2xl font-semibold">${f.monthRevenue.toFixed(2)}</p>
          <p className={`mt-1 text-xs font-medium ${f.monthOverMonth >= 0 ? "text-green-700" : "text-red-700"}`}>{f.monthOverMonth >= 0 ? "+" : ""}{f.monthOverMonth.toFixed(1)}% vs ${f.lastMonthRevenue.toFixed(2)}</p>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-base font-semibold">Income Statement</h3>
          <div className="grid gap-2 text-sm text-slate-800">
            <p className="flex justify-between"><span>Total Revenue</span><span>${f.revenue.toFixed(2)}</span></p>
            <p className="flex justify-between text-slate-600"><span>Cost of Goods Sold</span><span>-${f.cogs.toFixed(2)}</span></p>
            <p className="flex justify-between border-t border-slate-300 pt-2 font-semibold"><span>Gross Profit</span><span>${f.grossProfit.toFixed(2)}</span></p>
            <p className="flex justify-between text-slate-600"><span>Returns ({f.returnCountInPeriod})</span><span>-${f.refunds.toFixed(2)}</span></p>
            <p className="flex justify-between text-slate-600"><span>Other Expenses (opex + tax)</span><span>-${f.otherExpenses.toFixed(2)}</span></p>
            <p className="flex justify-between border-t border-slate-300 pt-2 text-base font-semibold text-slate-950"><span>Net Income</span><span>${f.netProfit.toFixed(2)}</span></p>
          </div>
        </Card>

        <Card>
          <h3 className="mb-3 text-base font-semibold">Sales by Item</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-left text-slate-700">
                  <th className="px-2 py-2">Item</th>
                  <th className="px-2 py-2">Quantity Sold</th>
                  <th className="px-2 py-2">Total Sales</th>
                </tr>
              </thead>
              <tbody>
                {salesByItem.slice(0, 10).map((seller) => (
                  <tr key={seller.label} className="border-b border-slate-200">
                    <td className="px-2 py-2">{seller.label}</td>
                    <td className="px-2 py-2">{seller.qty}</td>
                    <td className="px-2 py-2">${seller.revenue.toFixed(2)}</td>
                  </tr>
                ))}
                {!salesByItem.length ? (
                  <tr>
                    <td className="px-2 py-4 text-slate-600" colSpan={3}>No completed sales in this period.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            {salesByItem.length > 10 ? <p className="mt-2 text-xs text-slate-500">+{salesByItem.length - 10} more items</p> : null}
          </div>
        </Card>
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">Receivables & Payables (current)</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-sm font-medium text-slate-700">Accounts Receivable</p>
          <p className="mt-2 text-3xl font-semibold">${f.accountsReceivable.toFixed(2)}</p>
          <p className="mt-1 text-xs text-slate-600">Outstanding on {f.unpaidInvoiceCount} unpaid/partial invoices</p>
        </Card>
        <Card>
          <p className="text-sm font-medium text-slate-700">Accounts Payable</p>
          <p className="mt-2 text-3xl font-semibold">${f.accountsPayable.toFixed(2)}</p>
          <p className="mt-1 text-xs text-slate-600">Owed to suppliers across {f.lotsOwedCount} lots</p>
        </Card>
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">Inventory Valuation (current)</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-sm font-medium text-slate-700">Inventory at Cost</p>
          <p className="mt-2 text-3xl font-semibold">${inv.totalInventoryCost.toFixed(2)}</p>
        </Card>
        <Card>
          <p className="text-sm font-medium text-slate-700">Inventory at Retail</p>
          <p className="mt-2 text-3xl font-semibold">${inv.totalInventoryRetail.toFixed(2)}</p>
        </Card>
        <Card>
          <p className="text-sm font-medium text-slate-700">Potential Margin</p>
          <p className="mt-2 text-3xl font-semibold">${(inv.totalInventoryRetail - inv.totalInventoryCost).toFixed(2)}</p>
          <p className="mt-1 text-xs text-slate-600">If all current stock sells at retail</p>
        </Card>
        <Card>
          <p className="text-sm font-medium text-slate-700">Aging Stock ({AGING_DAYS}+ days)</p>
          <p className="mt-2 text-3xl font-semibold">{inv.agingCount}</p>
          <p className="mt-1 text-xs text-slate-600">Phones in stock without moving</p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-base font-semibold">Inventory by Category</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-left text-slate-700">
                  <th className="px-2 py-2">Category</th>
                  <th className="px-2 py-2">Units</th>
                  <th className="px-2 py-2">Cost Value</th>
                  <th className="px-2 py-2">Retail Value</th>
                </tr>
              </thead>
              <tbody>
                {inv.inventoryByCategory.map((row) => (
                  <tr key={row.category} className="border-b border-slate-200">
                    <td className="px-2 py-2">{row.category}</td>
                    <td className="px-2 py-2">{row.units}</td>
                    <td className="px-2 py-2">${row.cost.toFixed(2)}</td>
                    <td className="px-2 py-2">${row.retail.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h3 className="mb-3 text-base font-semibold">Low Stock Alerts</h3>
          {inv.lowStockItems.length ? (
            <div className="grid gap-1.5 text-sm">
              {inv.lowStockItems.map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-1.5">
                  <span className="text-slate-800">{item.label}</span>
                  <span className="font-medium text-red-700">{item.inStock} / {item.threshold}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-600">Nothing below threshold right now.</p>
          )}
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <h3 className="mb-3 text-base font-semibold">Aging Stock Detail</h3>
          {inv.agingPhones.length ? (
            <div className="grid gap-1.5 text-sm">
              {inv.agingPhones.slice(0, 8).map((phone) => (
                <div key={phone.label} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-1.5">
                  <span className="text-slate-800">{phone.label}</span>
                  <span className="text-slate-600">{phone.days}d</span>
                </div>
              ))}
              {inv.agingPhones.length > 8 ? <p className="text-xs text-slate-500">+{inv.agingPhones.length - 8} more</p> : null}
            </div>
          ) : (
            <p className="text-sm text-slate-600">No stock sitting longer than {AGING_DAYS} days.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
