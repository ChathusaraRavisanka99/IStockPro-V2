import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { InfoHelp } from "@/components/ui/info-help";
import { EntityLink } from "@/components/ui/entity-link";
import { formatMoney } from "@/lib/currency";
import type { ReportExtras } from "@/lib/report-extras";

type Row = ReportExtras["byModel"][number];

function Change({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-slate-500">new</span>;
  if (Math.abs(value) < 0.05) return <span className="text-xs text-slate-500">no change</span>;
  return (
    <span className={`text-xs font-medium ${value > 0 ? "text-emerald-700" : "text-red-700"}`}>
      {value > 0 ? "▲" : "▼"} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

const day = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** "This period vs the previous period of the same length." */
export function PeriodComparison({ comparison, showCost }: { comparison: ReportExtras["comparison"]; showCost: boolean }) {
  const items: { label: string; now: string; before: string; change: number | null }[] = [
    { label: "Revenue", now: formatMoney(comparison.revenue.now), before: formatMoney(comparison.revenue.before), change: comparison.revenue.change },
    { label: "Sales", now: String(comparison.sales.now), before: String(comparison.sales.before), change: comparison.sales.change },
    { label: "Units sold", now: String(comparison.unitsSold.now), before: String(comparison.unitsSold.before), change: comparison.unitsSold.change },
    ...(showCost
      ? [
          { label: "Gross profit", now: formatMoney(comparison.gross.now), before: formatMoney(comparison.gross.before), change: comparison.gross.change },
          { label: "Net profit", now: formatMoney(comparison.net.now), before: formatMoney(comparison.net.before), change: comparison.net.change },
        ]
      : []),
  ];
  return (
    <Card className="mb-4">
      <h3 className="mb-3 flex flex-wrap items-center gap-1.5 text-base font-semibold">
        Compared with the previous period
        <span className="text-xs font-normal text-slate-500">({day(comparison.previousFrom)} to {day(comparison.previousTo)})</span>
        <InfoHelp size="sm" title="Period comparison">Each figure for your selected range next to the same figure for the period of equal length just before it.</InfoHelp>
      </h3>
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {items.map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 px-3 py-2">
            <p className="text-xs font-medium text-slate-500">{item.label}</p>
            <p className="mt-0.5 text-lg font-semibold text-slate-900">{item.now}</p>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
              <Change value={item.change} /> <span>was {item.before}</span>
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function BreakdownTable({
  title,
  help,
  rows,
  name,
  showCost,
  showSales = true,
  limit = 10,
  footer,
}: {
  title: string;
  help: ReactNode;
  rows: Row[];
  name: (row: Row) => ReactNode;
  showCost: boolean;
  showSales?: boolean;
  limit?: number;
  footer?: ReactNode;
}) {
  const total = rows.reduce((sum, row) => sum + row.revenue, 0);
  return (
    <Card className="min-w-0">
      <h3 className="mb-3 flex items-center gap-1.5 text-base font-semibold">
        {title}
        <InfoHelp size="sm" title={title}>{help}</InfoHelp>
      </h3>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Name</th>
                {showSales ? <th className="px-2 py-2 text-right">Sales</th> : null}
                <th className="px-2 py-2 text-right">Units</th>
                <th className="px-2 py-2 text-right">Revenue</th>
                {showCost ? <th className="px-2 py-2 text-right">Profit</th> : null}
                {showCost ? <th className="px-2 py-2 text-right">Margin</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((row) => (
                <tr key={row.key} className="border-b border-slate-100">
                  <td className="px-2 py-2">
                    <span className="block min-w-[8rem]">{name(row)}</span>
                    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full rounded-full bg-[#2a78d6]" style={{ width: `${total > 0 ? (row.revenue / total) * 100 : 0}%` }} />
                    </span>
                  </td>
                  {showSales ? <td className="px-2 py-2 text-right">{row.sales}</td> : null}
                  <td className="px-2 py-2 text-right">{row.units}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right font-medium" data-sort={row.revenue}>
                    {formatMoney(row.revenue)}
                    <span className="block text-xs font-normal text-slate-500">{total > 0 ? ((row.revenue / total) * 100).toFixed(0) : 0}%</span>
                  </td>
                  {showCost ? <td className={`whitespace-nowrap px-2 py-2 text-right ${row.profit >= 0 ? "text-emerald-700" : "text-red-700"}`} data-sort={row.profit}>{formatMoney(row.profit)}</td> : null}
                  {showCost ? <td className="whitespace-nowrap px-2 py-2 text-right" data-sort={row.margin}>{row.margin.toFixed(1)}%</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > limit ? <p className="mt-2 text-xs text-slate-500">+{rows.length - limit} more</p> : null}
        </div>
      ) : (
        <p className="text-sm text-slate-600">No completed sales in this period.</p>
      )}
      {footer}
    </Card>
  );
}

function SimpleBars({ title, help, rows, footer }: { title: string; help: ReactNode; rows: { label: string; amount: number; count: number }[]; footer?: ReactNode }) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const max = Math.max(1, ...rows.map((row) => row.amount));
  return (
    <Card className="min-w-0">
      <h3 className="mb-3 flex items-center gap-1.5 text-base font-semibold">
        {title}
        <InfoHelp size="sm" title={title}>{help}</InfoHelp>
        <span className="ml-auto text-sm font-normal text-slate-600">{formatMoney(total)}</span>
      </h3>
      {rows.length ? (
        <ul className="grid gap-2.5 text-sm">
          {rows.map((row) => (
            <li key={row.label}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-slate-800">{row.label}</span>
                <span className="shrink-0 text-xs text-slate-600">
                  <span className="font-semibold text-slate-900">{formatMoney(row.amount)}</span> · {row.count}× · {total > 0 ? ((row.amount / total) * 100).toFixed(0) : 0}%
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-[#2a78d6]" style={{ width: `${(row.amount / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-600">Nothing in this period.</p>
      )}
      {footer}
    </Card>
  );
}

const METHOD_LABEL: Record<string, string> = { BankTransfer: "Bank transfer", UPI: "UPI / mobile", Cash: "Cash", Card: "Card", Cheque: "Cheque", Other: "Other" };

export function ReportBreakdowns({ extras, showCost, fromValue, toValue }: { extras: ReportExtras; showCost: boolean; fromValue: string; toValue: string }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <BreakdownTable
          title="Sales by brand"
          help="Revenue per phone brand (and accessories by category) in the selected range, with the share of total item revenue."
          rows={extras.byBrand}
          name={(row) => row.label}
          showCost={showCost}
        />
        <BreakdownTable
          title="Sales by model"
          help="Phone models ranked by revenue in the selected range. Click a model to see its details."
          rows={extras.byModel}
          name={(row) => (row.id ? <EntityLink kind="model" id={row.id}>{row.label}</EntityLink> : row.label)}
          showCost={showCost}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <BreakdownTable
          title="Top customers"
          help="Customers ranked by what they bought in the selected range. Walk-in sales (no customer picked) are grouped together. Click a customer for details."
          rows={extras.byCustomer}
          name={(row) => (row.id ? <EntityLink kind="customer" id={row.id}>{row.label}</EntityLink> : <span className="text-slate-600">{row.label}</span>)}
          showCost={showCost}
        />
        <BreakdownTable
          title="Sales by staff"
          help="Completed sales per user who recorded them in the selected range."
          rows={extras.byStaff}
          name={(row) => row.label}
          showCost={showCost}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <BreakdownTable title="Retail vs wholesale" help="Split of completed sales by sale type in the selected range." rows={extras.byType} name={(row) => row.label} showCost={showCost} />
        <SimpleBars
          title="Payments received"
          help="Customer payments recorded in the selected range, by payment method. This is cash actually collected — it can differ from revenue when sales are unpaid or paid later."
          rows={extras.payments.map((row) => ({ label: METHOD_LABEL[row.method] ?? row.method, amount: row.amount, count: row.count }))}
        />
        <SimpleBars
          title="Expenses by category"
          help="Operating expenses recorded in the selected range, by category."
          rows={extras.expensesByCategory.map((row) => ({ label: row.category, amount: row.amount, count: row.count }))}
          footer={
            <Link href={`/expenses?view=stats&from=${fromValue}&to=${toValue}`} className="mt-3 inline-block text-xs text-slate-600 underline">
              Open expense stats for this range
            </Link>
          }
        />
      </div>
    </div>
  );
}
