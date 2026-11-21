import Link from "next/link";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { formatMoney } from "@/lib/currency";

export type LotAnalyticsRow = {
  id: string;
  lotNumber: string;
  supplier: string;
  status: "Collection" | "Shipped" | "Cleared";
  paymentStatus: "Unpaid" | "Partial" | "Paid";
  bookmarked: boolean;
  units: number;
  inStock: number;
  sold: number;
  totalCost: number;
  paid: number;
  ageDays: number;
};

export type LotSort = "recent" | "sell-through" | "stock" | "outstanding" | "age";

const SORTS: { value: LotSort; label: string; costOnly?: boolean }[] = [
  { value: "recent", label: "Newest" },
  { value: "sell-through", label: "Sell-through" },
  { value: "stock", label: "Most in stock" },
  { value: "outstanding", label: "Most owed", costOnly: true },
  { value: "age", label: "Oldest" },
];

const STATUS_STYLES: Record<LotAnalyticsRow["status"], string> = { Collection: "bg-slate-400", Shipped: "bg-indigo-500", Cleared: "bg-sky-500" };
const PAYMENT_STYLES: Record<LotAnalyticsRow["paymentStatus"], string> = { Unpaid: "bg-red-500", Partial: "bg-amber-400", Paid: "bg-green-500" };

function StackedBar<T extends string>({ title, counts, styles }: { title: string; counts: Record<T, number>; styles: Record<T, string> }) {
  const entries = Object.entries(counts) as [T, number][];
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase text-slate-500">{title}</p>
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
        {total ? entries.map(([key, count]) => (count ? <div key={key} className={styles[key]} style={{ width: `${(count / total) * 100}%` }} title={`${key}: ${count}`} /> : null)) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {entries.map(([key, count]) => (
          <span key={key} className="flex items-center gap-1.5 text-slate-700">
            <span className={`inline-block size-2.5 rounded-full ${styles[key]}`} />
            {key} <span className="font-semibold text-slate-900">{count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function LotAnalytics({ lots, showCost, sort }: { lots: LotAnalyticsRow[]; showCost: boolean; sort: LotSort }) {
  const statusCounts = { Collection: 0, Shipped: 0, Cleared: 0 } as Record<LotAnalyticsRow["status"], number>;
  const paymentCounts = { Unpaid: 0, Partial: 0, Paid: 0 } as Record<LotAnalyticsRow["paymentStatus"], number>;
  for (const lot of lots) {
    statusCounts[lot.status]++;
    paymentCounts[lot.paymentStatus]++;
  }
  const outstanding = (lot: LotAnalyticsRow) => Math.max(0, lot.totalCost - lot.paid);
  const sellThrough = (lot: LotAnalyticsRow) => (lot.units ? lot.sold / lot.units : 0);
  const totalOwed = lots.reduce((sum, lot) => sum + outstanding(lot), 0);
  const totalUnits = lots.reduce((sum, lot) => sum + lot.units, 0);
  const totalSold = lots.reduce((sum, lot) => sum + lot.sold, 0);

  const sorters: Record<LotSort, (a: LotAnalyticsRow, b: LotAnalyticsRow) => number> = {
    recent: (a, b) => a.ageDays - b.ageDays,
    "sell-through": (a, b) => sellThrough(b) - sellThrough(a),
    stock: (a, b) => b.inStock - a.inStock,
    outstanding: (a, b) => outstanding(b) - outstanding(a),
    age: (a, b) => b.ageDays - a.ageDays,
  };
  // Bookmarked lots always lead, then the chosen sort.
  const sorted = [...lots].sort((a, b) => Number(b.bookmarked) - Number(a.bookmarked) || sorters[sort](a, b)).slice(0, 12);

  const sortToolbar = (
    <div className="flex flex-wrap gap-1 text-xs">
      {SORTS.filter((option) => showCost || !option.costOnly).map((option) => (
        <Link key={option.value} href={`/dashboard?lotSort=${option.value}`} scroll={false} className={`rounded-full border px-2.5 py-1 ${sort === option.value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"}`}>
          {option.label}
        </Link>
      ))}
    </div>
  );

  return (
    <div className="mt-6">
      <DataTableShell
        title="Lots Overview"
        toolbar={sortToolbar}
        help="Where every lot is in its Collection → Shipped → Cleared pipeline, how it's paid, and how fast its units are selling. Bookmarked lots (★ on the Lots page) are always listed first."
      >
        <div className="mb-5 grid gap-5 md:grid-cols-3">
          <StackedBar title={`Stage (${lots.length} lots)`} counts={statusCounts} styles={STATUS_STYLES} />
          <StackedBar title="Payment" counts={paymentCounts} styles={PAYMENT_STYLES} />
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 px-3 py-2">
              <p className="text-xs text-slate-500">Overall sell-through</p>
              <p className="text-lg font-semibold text-slate-900">{totalUnits ? Math.round((totalSold / totalUnits) * 100) : 0}%</p>
              <p className="text-xs text-slate-500">
                {totalSold} of {totalUnits} units
              </p>
            </div>
            {showCost ? (
              <div className="rounded-lg border border-slate-200 px-3 py-2">
                <p className="text-xs text-slate-500">Owed to suppliers</p>
                <p className="text-lg font-semibold text-slate-900">{formatMoney(totalOwed)}</p>
                <p className="text-xs text-slate-500">{paymentCounts.Unpaid + paymentCounts.Partial} lot(s) not fully paid</p>
              </div>
            ) : null}
          </div>
        </div>

        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-left text-slate-700">
              <th className="px-2 py-2">Lot</th>
              <th className="px-2 py-2">Stage</th>
              <th className="px-2 py-2">Payment</th>
              <th className="px-2 py-2">Sell-through</th>
              <th className="px-2 py-2 text-right">In stock</th>
              {showCost ? <th className="px-2 py-2 text-right">Owed</th> : null}
              <th className="px-2 py-2 text-right">Age</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((lot) => {
              const pct = Math.round(sellThrough(lot) * 100);
              return (
                <tr key={lot.id} className="border-b border-slate-200">
                  <td className="px-2 py-2">
                    <Link href={`/lots/${lot.id}`} className="font-medium text-slate-900 underline">
                      {lot.bookmarked ? <span className="mr-1 text-amber-500">★</span> : null}
                      {lot.lotNumber}
                    </Link>
                    <p className="text-xs text-slate-500">{lot.supplier}</p>
                  </td>
                  <td className="px-2 py-2">
                    <span className="flex items-center gap-1.5">
                      <span className={`inline-block size-2.5 rounded-full ${STATUS_STYLES[lot.status]}`} />
                      {lot.status}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <span className="flex items-center gap-1.5">
                      <span className={`inline-block size-2.5 rounded-full ${PAYMENT_STYLES[lot.paymentStatus]}`} />
                      {lot.paymentStatus}
                    </span>
                  </td>
                  <td className="min-w-[140px] px-2 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-20 text-right text-xs text-slate-600">
                        {lot.sold}/{lot.units} · {pct}%
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right">{lot.inStock}</td>
                  {showCost ? <td className="whitespace-nowrap px-2 py-2 text-right">{outstanding(lot) > 0 ? formatMoney(outstanding(lot)) : "-"}</td> : null}
                  <td className="whitespace-nowrap px-2 py-2 text-right text-slate-600">{lot.ageDays}d</td>
                </tr>
              );
            })}
            {!sorted.length ? (
              <tr>
                <td className="px-2 py-4 text-slate-600" colSpan={showCost ? 7 : 6}>
                  No lots yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {lots.length > sorted.length ? (
          <p className="mt-2 text-xs text-slate-500">
            Showing {sorted.length} of {lots.length} lots — <Link href="/lots" className="underline">see all lots</Link>.
          </p>
        ) : null}
      </DataTableShell>
    </div>
  );
}
