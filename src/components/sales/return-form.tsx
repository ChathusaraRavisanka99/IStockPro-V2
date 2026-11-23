"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/currency";
import { SalePickerDialog } from "@/components/sales/sale-picker-dialog";
import type { ReturnableSale } from "@/lib/return-sale-search";

type Props = {
  action: (formData: FormData) => void | Promise<void>;
  /** "+ Add sale" in the picker: records a sale by total only. */
  quickAddSale?: (formData: FormData) => void | Promise<unknown>;
};

const CONDITIONS = ["Resalable", "Repairable", "Damaged"];

export function ReturnForm({ action, quickAddSale }: Props) {
  const [selectedSale, setSelectedSale] = useState<ReturnableSale | null>(null);
  const [picking, setPicking] = useState(false);
  const [saleItemId, setSaleItemId] = useState("");
  const [amount, setAmount] = useState("0");
  const [quantity, setQuantity] = useState("1");

  const selectedItem = selectedSale?.items.find((item) => item.id === saleItemId);

  useEffect(() => {
    if (selectedItem) {
      setQuantity(String(selectedItem.quantity));
      setAmount((selectedItem.unitPrice * selectedItem.quantity).toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleItemId]);

  function handleQuantityChange(value: string) {
    const max = selectedItem?.quantity;
    const raw = Math.max(1, Number(value) || 1);
    const clamped = max !== undefined ? Math.min(raw, Math.max(1, max)) : raw;
    setQuantity(String(clamped));
    if (selectedItem) setAmount((selectedItem.unitPrice * clamped).toFixed(2));
  }

  return (
    <form
      action={async (formData) => {
        await action(formData);
        setSelectedSale(null);
        setSaleItemId("");
        setAmount("0");
        setQuantity("1");
      }}
      className="grid gap-3"
    >
      <input type="hidden" name="saleId" value={selectedSale?.id ?? ""} />
      {picking ? (
        <SalePickerDialog
          quickAddSale={quickAddSale}
          onClose={() => setPicking(false)}
          onPick={(sale) => {
            setSelectedSale(sale);
            setSaleItemId("");
            setAmount("0");
            setQuantity("1");
            setPicking(false);
          }}
        />
      ) : null}
      <div className="grid gap-3 md:grid-cols-3">
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm"
          title="Search sales by number, customer, IMEI or date"
        >
          {selectedSale ? (
            <span className="min-w-0 truncate">
              <span className="font-medium text-slate-900">{selectedSale.saleNumber}</span>
              <span className="text-slate-500"> · {selectedSale.date} · {selectedSale.customer ?? "Walk-in"}</span>
            </span>
          ) : (
            <span className="text-slate-500">Select sale…</span>
          )}
          <span className="shrink-0 text-xs text-slate-500">{selectedSale ? "Change" : "Search"}</span>
        </button>
        <input name="reason" placeholder="Reason" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
        <select name="condition" defaultValue="Resalable" className="rounded-lg border border-slate-300 bg-white px-3 py-2">
          {CONDITIONS.map((condition) => (
            <option key={condition} value={condition}>
              {condition}
            </option>
          ))}
        </select>
      </div>

      {selectedSale ? (
        selectedSale.items.length ? (
          <div className="grid gap-2 rounded-xl border border-slate-200 p-3">
            <p className="text-sm font-medium text-slate-700">Select the item being returned</p>
            <div className="grid gap-1.5">
              {selectedSale.items.map((item) => (
                <label key={item.id} className="flex flex-col gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between">
                  <span className="flex items-center gap-2">
                    <input type="radio" name="saleItemId" value={item.id} required checked={saleItemId === item.id} onChange={() => setSaleItemId(item.id)} />
                    {item.label}
                  </span>
                  <span className="text-slate-600">
                    {item.quantity} returnable · {formatMoney(item.unitPrice)} each
                  </span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <p className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">This sale has no returnable line items — you can still record a manual refund below.</p>
        )
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <label className="grid min-w-0 gap-1 text-sm text-slate-700">
          Quantity{selectedItem ? ` (max ${selectedItem.quantity})` : ""}
          <input name="quantity" type="number" min={1} max={selectedItem?.quantity} value={quantity} onChange={(event) => handleQuantityChange(event.target.value)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
        </label>
        <label className="grid min-w-0 gap-1 text-sm text-slate-700">
          Refund amount
          <input name="totalCredit" type="number" step="0.01" min={0} value={amount} onChange={(event) => setAmount(event.target.value)} required className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
        </label>
        <button className="btn btn-md btn-primary self-end" disabled={!selectedSale} title={selectedSale ? undefined : "Pick a sale first"}>
          Create Return + Credit Note
        </button>
      </div>
    </form>
  );
}
