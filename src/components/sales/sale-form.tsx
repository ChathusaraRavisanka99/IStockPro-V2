"use client";

import { useMemo, useState } from "react";
import { SearchableSelect, type QuickAdd } from "@/components/ui/searchable-select";
import { CartBuilder, type CartLine } from "@/components/ui/cart-builder";

type Option = { value: string; label: string };
type ItemOption = { value: string; label: string; price: number; maxQuantity?: number; notes?: string | null; category?: string };

type Props = {
  customers: Option[];
  customerQuickAdd: QuickAdd;
  items: ItemOption[];
  action: (formData: FormData) => void | Promise<void>;
};

export function SaleForm({ customers, customerQuickAdd, items, action }: Props) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [taxMode, setTaxMode] = useState<"Percent" | "Amount">("Amount");
  const [taxValue, setTaxValue] = useState("0");
  const [handlingFee, setHandlingFee] = useState("0");
  const [discount, setDiscount] = useState("0");

  const subtotal = useMemo(() => lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0), [lines]);
  const taxAmount = taxMode === "Percent" ? (subtotal * (Number(taxValue) || 0)) / 100 : Number(taxValue) || 0;
  const total = subtotal + taxAmount + (Number(handlingFee) || 0) - (Number(discount) || 0);

  return (
    <form action={action} className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="grid gap-3">
        <SearchableSelect name="customerId" placeholder="Walk-in customer" options={customers} quickAdd={customerQuickAdd} />
        <CartBuilder items={items} lines={lines} onChange={setLines} showNotes />
      </div>
      <div className="grid content-start gap-3 rounded-xl border border-slate-200 p-4">
        <p className="text-sm font-semibold text-slate-900">Summary</p>
        <p className="flex justify-between text-sm text-slate-700">
          <span>Subtotal</span>
          <span>${subtotal.toFixed(2)}</span>
        </p>

        <div className="grid min-w-0 gap-1">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-700">Tax</span>
            <div className="flex overflow-hidden rounded-lg border border-slate-300 text-xs">
              <button type="button" onClick={() => setTaxMode("Percent")} className={`px-2 py-1 ${taxMode === "Percent" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}>%</button>
              <button type="button" onClick={() => setTaxMode("Amount")} className={`px-2 py-1 ${taxMode === "Amount" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}>$</button>
            </div>
          </div>
          <input type="hidden" name="taxType" value={taxMode} />
          <input name="taxValue" type="number" step="0.01" min={0} value={taxValue} onChange={(event) => setTaxValue(event.target.value)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
          <p className="text-xs text-slate-500">= ${taxAmount.toFixed(2)}{taxMode === "Amount" && subtotal > 0 ? ` (${((taxAmount / subtotal) * 100).toFixed(2)}%)` : ""}</p>
        </div>

        <label className="grid min-w-0 gap-1 text-sm text-slate-700">
          Handling fee
          <input name="handlingFee" type="number" step="0.01" min={0} value={handlingFee} onChange={(event) => setHandlingFee(event.target.value)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
        </label>
        <label className="grid min-w-0 gap-1 text-sm text-slate-700">
          Discount
          <input name="discount" type="number" step="0.01" min={0} value={discount} onChange={(event) => setDiscount(event.target.value)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
        </label>
        <p className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-950">
          <span>Total</span>
          <span>${total.toFixed(2)}</span>
        </p>
        <button type="submit" disabled={lines.length === 0} className="rounded-lg bg-slate-900 px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50">
          Create Sale
        </button>
        {lines.length === 0 ? <p className="text-xs text-slate-500">Add at least one item before creating the sale.</p> : null}
      </div>
    </form>
  );
}
