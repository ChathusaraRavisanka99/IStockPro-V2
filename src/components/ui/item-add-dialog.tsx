"use client";

import { Minus, Plus } from "lucide-react";
import { formatMoney } from "@/lib/currency";
import { Modal, modalButton } from "@/components/ui/modal";

type Props = {
  name: string;
  details: { label: string; value: string }[];
  retailPrice: number;
  wholesalePrice?: number;
  /** Cost figures — only passed for roles allowed to see cost. */
  cost?: { unitCost: number; totalCost: number; breakdown?: { label: string; amount: number }[] };
  priceMode: "Retail" | "Wholesale";
  quantity: string;
  onQuantityChange: (value: string) => void;
  /** Units still addable (stock minus what's already in the cart); undefined = unlimited. */
  remaining?: number;
  notes?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

function margin(price: number, cost: number) {
  if (price <= 0) return null;
  return ((price - cost) / price) * 100;
}

function PriceOption({ label, price, cost, active }: { label: string; price: number; cost?: number; active: boolean }) {
  const pct = cost !== undefined ? margin(price, cost) : null;
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-700"}`}>
      <p className={`text-xs ${active ? "text-slate-300" : "text-slate-500"}`}>
        {label}
        {active ? " · applied" : ""}
      </p>
      <p className="mt-0.5 text-base font-semibold">{formatMoney(price)}</p>
      {pct !== null ? <p className={`text-xs ${active ? "text-slate-300" : "text-slate-500"}`}>{pct.toFixed(1)}% margin</p> : null}
    </div>
  );
}

export function ItemAddDialog({ name, details, retailPrice, wholesalePrice, cost, priceMode, quantity, onQuantityChange, remaining, notes, onConfirm, onCancel }: Props) {
  const appliedPrice = priceMode === "Wholesale" && wholesalePrice !== undefined ? wholesalePrice : retailPrice;
  const qty = Math.max(1, Number(quantity) || 1);
  const overStock = remaining !== undefined && qty > remaining;
  const step = (delta: number) => {
    const next = Math.max(1, qty + delta);
    onQuantityChange(String(remaining !== undefined ? Math.min(next, Math.max(1, remaining)) : next));
  };

  return (
    <Modal
      title={name}
      subtitle={remaining !== undefined ? `${remaining} available to add` : undefined}
      onClose={onCancel}
      footer={
        <>
          <div className="mr-auto flex items-center rounded-lg border border-slate-300 bg-white">
            <button type="button" onClick={() => step(-1)} aria-label="Decrease quantity" className="p-2 text-slate-600 hover:text-slate-900 disabled:opacity-40" disabled={qty <= 1}>
              <Minus className="size-4" />
            </button>
            <input
              type="number"
              min={1}
              max={remaining}
              value={quantity}
              data-autofocus
              aria-label="Quantity"
              onChange={(event) => onQuantityChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !overStock) onConfirm();
              }}
              className="w-14 border-x border-slate-200 py-1.5 text-center text-sm outline-none"
            />
            <button type="button" onClick={() => step(1)} aria-label="Increase quantity" className="p-2 text-slate-600 hover:text-slate-900 disabled:opacity-40" disabled={remaining !== undefined && qty >= remaining}>
              <Plus className="size-4" />
            </button>
          </div>
          <button type="button" onClick={onCancel} className={modalButton.secondary}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={overStock} className={modalButton.primary}>
            Add {qty > 1 ? `${qty} · ${formatMoney(appliedPrice * qty)}` : "to cart"}
          </button>
        </>
      }
    >
      <div className={`grid gap-2 ${wholesalePrice !== undefined ? "grid-cols-2" : "grid-cols-1"}`}>
        <PriceOption label="Retail" price={retailPrice} cost={cost?.totalCost} active={priceMode === "Retail"} />
        {wholesalePrice !== undefined ? <PriceOption label="Wholesale" price={wholesalePrice} cost={cost?.totalCost} active={priceMode === "Wholesale"} /> : null}
      </div>

      {notes ? (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="font-semibold">Note:</span> {notes}
        </p>
      ) : null}

      {details.length ? (
        <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-xl bg-slate-50 px-3 py-2.5 text-sm sm:grid-cols-2">
          {details.map((row) => (
            <div key={row.label} className="flex justify-between gap-3 sm:block">
              <dt className="text-xs text-slate-500">{row.label}</dt>
              <dd className="text-right font-medium text-slate-900 sm:text-left">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {cost ? (
        <div className="mt-4 grid gap-1.5 text-sm text-slate-700">
          <p className="flex justify-between">
            <span>Unit cost</span>
            <span>{formatMoney(cost.unitCost)}</span>
          </p>
          {(cost.breakdown ?? [])
            .filter((entry) => entry.amount !== 0)
            .map((entry) => (
              <p key={entry.label} className="flex justify-between pl-3 text-xs text-slate-500">
                <span>+ {entry.label}</span>
                <span>{formatMoney(entry.amount)}</span>
              </p>
            ))}
          <p className="flex justify-between font-medium text-slate-900">
            <span>Total cost</span>
            <span>{formatMoney(cost.totalCost)}</span>
          </p>
          <p className="flex justify-between border-t border-slate-200 pt-1.5 font-semibold text-slate-900">
            <span>Profit at {priceMode.toLowerCase()}</span>
            <span className={appliedPrice - cost.totalCost >= 0 ? "text-emerald-700" : "text-red-700"}>
              {appliedPrice - cost.totalCost >= 0 ? "▲" : "▼"} {formatMoney(appliedPrice - cost.totalCost)}
              {appliedPrice > 0 ? ` (${(((appliedPrice - cost.totalCost) / appliedPrice) * 100).toFixed(1)}%)` : ""}
            </span>
          </p>
        </div>
      ) : null}

      {overStock ? <p className="mt-3 text-xs text-red-700">Only {remaining} available.</p> : null}
    </Modal>
  );
}
