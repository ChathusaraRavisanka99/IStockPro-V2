"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { formatMoney } from "@/lib/currency";

export type CostBreakdownData = {
  name: string;
  unitCost: number;
  totalCost: number;
  wholesalePrice: number;
  retailPrice: number;
};

/**
 * Wraps an existing table row: clicking anywhere in the row (except an action button/
 * form tagged with data-no-modal, which should call stopPropagation) pops a small modal
 * showing unit cost, total cost, wholesale/retail price, and profit amount/percent
 * (computed against retail, matching src/lib/reports.ts's margin convention).
 */
export function CostRow({ data, className, children }: { data: CostBreakdownData; className?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const profitAmount = data.retailPrice - data.totalCost;
  const profitPercent = data.retailPrice > 0 ? (profitAmount / data.retailPrice) * 100 : 0;

  return (
    <>
      <tr className={`cursor-pointer hover:bg-slate-50 ${className || ""}`} onClick={() => setOpen(true)}>
        {children}
      </tr>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
              <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">{data.name}</h3>
                  <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700" aria-label="Close">
                    ✕
                  </button>
                </div>
                <div className="grid gap-1.5 text-sm text-slate-700">
                  <p className="flex justify-between"><span>Unit cost</span><span>{formatMoney(data.unitCost)}</span></p>
                  <p className="flex justify-between"><span>Total cost</span><span>{formatMoney(data.totalCost)}</span></p>
                  <p className="flex justify-between"><span>Wholesale price</span><span>{formatMoney(data.wholesalePrice)}</span></p>
                  <p className="flex justify-between"><span>Retail price</span><span>{formatMoney(data.retailPrice)}</span></p>
                  <div className="mt-2 border-t border-slate-200 pt-2">
                    <p className="flex justify-between font-medium text-slate-900">
                      <span>Profit</span>
                      <span className={profitAmount >= 0 ? "text-green-700" : "text-red-700"}>
                        {formatMoney(profitAmount)} ({profitPercent.toFixed(1)}%)
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
