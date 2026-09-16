"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { formatMoney } from "@/lib/currency";

export type CostBreakdownData = {
  name: string;
  unitCost: number;
  totalCost: number;
  wholesalePrice: number;
  retailPrice: number;
  /** Full item details (model/variant, IMEI, grade, lot, SKU, specs, etc.) shown above the cost breakdown. */
  details?: { label: string; value: string }[];
  /** Expense records linked to this item. Pass an empty array (vs. omitting the prop) to show the
   * section with a "no expenses" message rather than hiding it entirely. */
  expenses?: { label: string; amount: number; date: string }[];
  /** What's added on top of unitCost to reach totalCost (e.g. tag cost, battery cost).
   * Only rendered when unitCost and totalCost actually differ; zero-amount entries are hidden. */
  costBreakdown?: { label: string; amount: number }[];
};

function CostBreakdownDialog({ data, onClose }: { data: CostBreakdownData; onClose: () => void }) {
  const retailProfit = data.retailPrice - data.totalCost;
  const retailProfitPercent = data.retailPrice > 0 ? (retailProfit / data.retailPrice) * 100 : 0;
  const wholesaleProfit = data.wholesalePrice - data.totalCost;
  const wholesaleProfitPercent = data.wholesalePrice > 0 ? (wholesaleProfit / data.wholesalePrice) * 100 : 0;
  const totalExpenses = (data.expenses ?? []).reduce((sum, expense) => sum + expense.amount, 0);
  const nonZeroCostBreakdown = (data.costBreakdown ?? []).filter((entry) => entry.amount !== 0);
  const showCostBreakdown = data.unitCost !== data.totalCost && nonZeroCostBreakdown.length > 0;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">{data.name}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">
            ✕
          </button>
        </div>

        {data.details?.length ? (
          <div className="mb-4 grid gap-1 border-b border-slate-100 pb-4 text-sm text-slate-700">
            {data.details.map((row) => (
              <p key={row.label} className="flex justify-between gap-3">
                <span className="text-slate-500">{row.label}</span>
                <span className="text-right font-medium text-slate-900">{row.value}</span>
              </p>
            ))}
          </div>
        ) : null}

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
          <p className="flex justify-between"><span>Total cost</span><span>{formatMoney(data.totalCost)}</span></p>
          <p className="flex justify-between"><span>Wholesale price</span><span>{formatMoney(data.wholesalePrice)}</span></p>
          <p className="flex justify-between"><span>Retail price</span><span>{formatMoney(data.retailPrice)}</span></p>
          <div className="mt-2 grid gap-1 border-t border-slate-200 pt-2">
            <p className="flex justify-between font-medium text-slate-900">
              <span>Retail profit</span>
              <span className={retailProfit >= 0 ? "text-green-700" : "text-red-700"}>
                {formatMoney(retailProfit)} ({retailProfitPercent.toFixed(1)}%)
              </span>
            </p>
            <p className="flex justify-between font-medium text-slate-900">
              <span>Wholesale profit</span>
              {data.wholesalePrice > 0 ? (
                <span className={wholesaleProfit >= 0 ? "text-green-700" : "text-red-700"}>
                  {formatMoney(wholesaleProfit)} ({wholesaleProfitPercent.toFixed(1)}%)
                </span>
              ) : (
                <span className="text-slate-400">Not set</span>
              )}
            </p>
          </div>
        </div>

        {data.expenses ? (
          <div className="mt-4 border-t border-slate-200 pt-3">
            <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Linked Expenses</p>
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
          </div>
        ) : null}
      </div>
    </div>,
    document.body
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
