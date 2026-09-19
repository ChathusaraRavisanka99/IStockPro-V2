"use client";

import { createPortal } from "react-dom";
import { formatMoney } from "@/lib/currency";

type Props = {
  name: string;
  details: { label: string; value: string }[];
  retailPrice: number;
  wholesalePrice?: number;
  priceMode: "Retail" | "Wholesale";
  quantity: string;
  onQuantityChange: (value: string) => void;
  /** Units still addable (stock minus what's already in the cart); undefined = unlimited. */
  remaining?: number;
  notes?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ItemAddDialog({ name, details, retailPrice, wholesalePrice, priceMode, quantity, onQuantityChange, remaining, notes, onConfirm, onCancel }: Props) {
  if (typeof document === "undefined") return null;
  const appliedPrice = priceMode === "Wholesale" && wholesalePrice !== undefined ? wholesalePrice : retailPrice;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div role="dialog" aria-modal="true" className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">{name}</h3>
          <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-700" aria-label="Close">
            ✕
          </button>
        </div>

        {details.length ? (
          <div className="mb-4 grid gap-1 border-b border-slate-100 pb-4 text-sm">
            {details.map((row) => (
              <p key={row.label} className="flex justify-between gap-3">
                <span className="text-slate-500">{row.label}</span>
                <span className="text-right font-medium text-slate-900">{row.value}</span>
              </p>
            ))}
          </div>
        ) : null}

        <div className="grid gap-1.5 text-sm text-slate-700">
          <p className="flex justify-between">
            <span>Retail price</span>
            <span className={priceMode === "Retail" ? "font-semibold text-slate-900" : ""}>{formatMoney(retailPrice)}</span>
          </p>
          {wholesalePrice !== undefined ? (
            <p className="flex justify-between">
              <span>Wholesale price</span>
              <span className={priceMode === "Wholesale" ? "font-semibold text-slate-900" : ""}>{formatMoney(wholesalePrice)}</span>
            </p>
          ) : null}
          <p className="mt-1 flex justify-between border-t border-slate-200 pt-2 font-medium text-slate-900">
            <span>Added at ({priceMode.toLowerCase()})</span>
            <span>{formatMoney(appliedPrice)}</span>
          </p>
        </div>

        {notes ? (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span className="font-semibold">Note:</span> {notes}
          </p>
        ) : null}

        <div className="mt-4 flex items-end gap-3">
          <label className="grid gap-1 text-sm text-slate-700">
            Quantity{remaining !== undefined ? <span className="text-xs text-slate-500">{remaining} available</span> : null}
            <input
              type="number"
              min={1}
              max={remaining}
              value={quantity}
              onChange={(event) => onQuantityChange(event.target.value)}
              className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2"
            />
          </label>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button type="button" onClick={onConfirm} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">
              Add to cart
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
