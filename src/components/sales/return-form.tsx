"use client";

import { useEffect, useState } from "react";
import { SearchableSelect, type QuickAdd } from "@/components/ui/searchable-select";
import { formatMoney } from "@/lib/currency";

type SaleItemOption = {
  id: string;
  label: string;
  quantity: number;
  unitPrice: number;
};

type SaleOption = {
  id: string;
  label: string;
  items: SaleItemOption[];
};

type Props = {
  sales: SaleOption[];
  action: (formData: FormData) => void | Promise<void>;
  quickAdd?: QuickAdd;
};

const CONDITIONS = ["Resalable", "Repairable", "Damaged"];

export function ReturnForm({ sales, action, quickAdd }: Props) {
  const [saleId, setSaleId] = useState("");
  const [saleItemId, setSaleItemId] = useState("");
  const [amount, setAmount] = useState("0");
  const [quantity, setQuantity] = useState("1");

  const selectedSale = sales.find((sale) => sale.id === saleId);
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
    <form action={action} className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-3">
        <SearchableSelect
          name="saleId"
          required
          placeholder="Select sale"
          options={sales.map((sale) => ({ value: sale.id, label: sale.label }))}
          onChange={(value) => {
            setSaleId(value);
            setSaleItemId("");
            setAmount("0");
            setQuantity("1");
          }}
          quickAdd={quickAdd}
        />
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
        <button className="self-end rounded-lg bg-slate-900 px-3 py-2 text-white">Create Return + Credit Note</button>
      </div>
    </form>
  );
}
