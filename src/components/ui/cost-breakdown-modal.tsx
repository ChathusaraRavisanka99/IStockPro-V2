"use client";

import { useState, type ReactNode } from "react";
import { formatMoney } from "@/lib/currency";
import { Modal, modalButton } from "@/components/ui/modal";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export type CostBreakdownData = {
  name: string;
  unitCost: number;
  totalCost: number;
  wholesalePrice: number;
  retailPrice: number;
  /** Full item details (model/variant, IMEI, grade, lot, SKU, specs, etc.) shown above the cost breakdown. */
  details?: { label: string; value: string; href?: string }[];
  /** Expense records linked to this item. Pass an empty array (vs. omitting the prop) to show the
   * section with a "no expenses" message rather than hiding it entirely. */
  expenses?: { label: string; amount: number; date: string }[];
  /** What's added on top of unitCost to reach totalCost (e.g. tag cost, battery cost).
   * Only rendered when unitCost and totalCost actually differ; zero-amount entries are hidden. */
  costBreakdown?: { label: string; amount: number }[];
};

function ProfitTile({ label, price, cost }: { label: string; price: number; cost: number }) {
  if (price <= 0) {
    return (
      <div className="rounded-xl border border-slate-200 px-3 py-2.5">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="mt-0.5 text-sm text-slate-400">Price not set</p>
      </div>
    );
  }
  const profit = price - cost;
  const percent = (profit / price) * 100;
  const positive = profit >= 0;
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${positive ? "border-emerald-200 bg-emerald-50/60" : "border-red-200 bg-red-50/60"}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-0.5 text-base font-semibold ${positive ? "text-emerald-800" : "text-red-800"}`}>
        {positive ? "▲" : "▼"} {formatMoney(profit)}
      </p>
      <p className="text-xs text-slate-600">
        {percent.toFixed(1)}% margin · sells at {formatMoney(price)}
      </p>
    </div>
  );
}

function CostBreakdownDialog({ data, onClose }: { data: CostBreakdownData; onClose: () => void }) {
  const totalExpenses = (data.expenses ?? []).reduce((sum, expense) => sum + expense.amount, 0);
  const nonZeroCostBreakdown = (data.costBreakdown ?? []).filter((entry) => entry.amount !== 0);
  const showCostBreakdown = data.unitCost !== data.totalCost && nonZeroCostBreakdown.length > 0;

  return (
    <Modal title={data.name} subtitle="Cost, pricing and profit" onClose={onClose} footer={<button type="button" onClick={onClose} className={modalButton.secondary}>Close</button>}>
      <div className="grid grid-cols-2 gap-2">
        <ProfitTile label="Retail profit" price={data.retailPrice} cost={data.totalCost} />
        <ProfitTile label="Wholesale profit" price={data.wholesalePrice} cost={data.totalCost} />
      </div>

      {data.details?.length ? (
        <section className="mt-4">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Details</p>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-xl bg-slate-50 px-3 py-2.5 text-sm sm:grid-cols-2">
            {data.details.map((row) => (
              <div key={row.label} className="flex justify-between gap-3 sm:block">
                <dt className="text-xs text-slate-500">{row.label}</dt>
                <dd className="text-right font-medium text-slate-900 sm:text-left">
                  {row.href ? (
                    <Link href={row.href} className="inline-flex items-center gap-1 text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-900">
                      {row.value} <ArrowUpRight className="size-3.5" />
                    </Link>
                  ) : (
                    row.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section className="mt-4">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Cost build-up</p>
        <div className="grid gap-1.5 text-sm text-slate-700">
          <p className="flex justify-between"><span>Unit cost</span><span>{formatMoney(data.unitCost)}</span></p>
          {showCostBreakdown
            ? nonZeroCostBreakdown.map((entry) => (
                <p key={entry.label} className="flex justify-between pl-3 text-xs text-slate-500">
                  <span>+ {entry.label}</span>
                  <span>{formatMoney(entry.amount)}</span>
                </p>
              ))
            : null}
          <p className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold text-slate-900"><span>Total cost</span><span>{formatMoney(data.totalCost)}</span></p>
          <p className="flex justify-between"><span>Wholesale price</span><span>{data.wholesalePrice > 0 ? formatMoney(data.wholesalePrice) : "Not set"}</span></p>
          <p className="flex justify-between"><span>Retail price</span><span>{formatMoney(data.retailPrice)}</span></p>
        </div>
      </section>

      {data.expenses ? (
        <section className="mt-4">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Linked expenses</p>
          {data.expenses.length ? (
            <div className="grid gap-1.5 text-sm text-slate-700">
              {data.expenses.map((expense, i) => (
                <p key={i} className="flex justify-between gap-2">
                  <span>
                    {expense.label} <span className="text-xs text-slate-500">({expense.date})</span>
                  </span>
                  <span>{formatMoney(expense.amount)}</span>
                </p>
              ))}
              <p className="flex justify-between border-t border-slate-100 pt-1.5 font-medium text-slate-900">
                <span>Total expenses</span>
                <span>{formatMoney(totalExpenses)}</span>
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No expenses recorded for this item.</p>
          )}
        </section>
      ) : null}
    </Modal>
  );
}

/**
 * Wraps an existing table row: clicking anywhere in the row (except an action button/
 * form tagged with data-no-modal, which should call stopPropagation) pops a small modal
 * showing full item details, unit/total cost, wholesale/retail price, profit against each
 * (retail and wholesale computed separately, both matching src/lib/reports.ts's margin
 * convention), and any linked expenses.
 */
export function CostRow({ data, className, children }: { data: CostBreakdownData; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className={`cursor-pointer hover:bg-slate-50 ${className || ""}`} onClick={() => setOpen(true)}>
        {children}
      </tr>
      {open ? <CostBreakdownDialog data={data} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/**
 * Same popup as CostRow, for non-table (card/grid) layouts: wraps children in a clickable
 * div instead of a tr. Action buttons inside should stopPropagation on their own onClick.
 */
export function CostCard({ data, className, children }: { data: CostBreakdownData; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`cursor-pointer ${className || ""}`} onClick={() => setOpen(true)}>
      {children}
      {open ? <CostBreakdownDialog data={data} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
