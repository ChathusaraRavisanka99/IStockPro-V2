"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { History, X } from "lucide-react";
import { SearchableSelect, type QuickAdd } from "@/components/ui/searchable-select";
import { CartBuilder, repriceLines, type CartLine, type CartItemOption } from "@/components/ui/cart-builder";
import { SaleTypeToggle } from "@/components/ui/sale-type-toggle";
import { formatMoney } from "@/lib/currency";

type Option = { value: string; label: string };

type Props = {
  customers: Option[];
  customerQuickAdd: QuickAdd;
  items: CartItemOption[];
  action: (formData: FormData) => void | Promise<void>;
};

export function SaleForm({ customers, customerQuickAdd, items, action }: Props) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [saleType, setSaleType] = useState<"Retail" | "Wholesale">("Retail");
  const [taxMode, setTaxMode] = useState<"Percent" | "Amount">("Amount");
  const [taxValue, setTaxValue] = useState("0");
  const [handlingFee, setHandlingFee] = useState("0");
  const [discount, setDiscount] = useState("0");

  // The bill in progress is kept in this browser tab, so stepping away (e.g. "Edit full details"
  // on an item) and coming back doesn't lose it. After submitting, the last bill is offered back
  // once instead of being silently dropped — in case saving failed.
  const DRAFT_KEY = "istockpro-sale-draft";
  const restored = useRef(false);
  const [lastSubmitted, setLastSubmitted] = useState<{ lines: CartLine[] } | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.submitted) setLastSubmitted(draft);
        else if (Array.isArray(draft.lines)) {
          setLines(draft.lines);
          if (draft.saleType) setSaleType(draft.saleType);
          if (draft.taxMode) setTaxMode(draft.taxMode);
          if (draft.taxValue !== undefined) setTaxValue(draft.taxValue);
          if (draft.handlingFee !== undefined) setHandlingFee(draft.handlingFee);
          if (draft.discount !== undefined) setDiscount(draft.discount);
        }
      }
    } catch {
      // storage unavailable
    }
    restored.current = true;
  }, []);
  useEffect(() => {
    if (!restored.current) return;
    try {
      if (lines.length) sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ lines, saleType, taxMode, taxValue, handlingFee, discount }));
      else if (!lastSubmitted) sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
  }, [lines, saleType, taxMode, taxValue, handlingFee, discount, lastSubmitted]);

  function restoreLast() {
    if (!lastSubmitted) return;
    // Only items still in stock can come back.
    const available = new Set(items.map((item) => item.value));
    setLines(lastSubmitted.lines.filter((line) => available.has(line.key)));
    setLastSubmitted(null);
  }
  function discardLast() {
    setLastSubmitted(null);
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
  }

  const subtotal = useMemo(() => lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0), [lines]);
  const taxAmount = taxMode === "Percent" ? (subtotal * (Number(taxValue) || 0)) / 100 : Number(taxValue) || 0;
  const total = subtotal + taxAmount + (Number(handlingFee) || 0) - (Number(discount) || 0);

  return (
    <form
      action={action}
      onSubmit={() => {
        try {
          sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ lines, submitted: true }));
        } catch {
          // ignore
        }
      }}
      className="grid gap-4 lg:grid-cols-[1fr_280px]"
    >
      <div className="grid content-start gap-3">
        {lastSubmitted && !lines.length ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
            <History className="size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              Your last bill ({lastSubmitted.lines.length} item{lastSubmitted.lines.length === 1 ? "" : "s"}) was submitted. If it didn&apos;t save, restore it here.
            </span>
            <button type="button" onClick={restoreLast} className="btn btn-xs btn-primary">
              Restore bill
            </button>
            <button type="button" onClick={discardLast} aria-label="Dismiss" className="rounded p-1 text-sky-700 hover:bg-sky-100">
              <X className="size-4" />
            </button>
          </div>
        ) : null}
        <SearchableSelect name="customerId" placeholder="Walk-in customer" options={customers} quickAdd={customerQuickAdd} />

        <SaleTypeToggle
          label="Sale type"
          name="saleType"
          value={saleType}
          onChange={(next) => {
            setLines((current) => repriceLines(current, items, saleType, next));
            setSaleType(next);
          }}
        />

        <CartBuilder items={items} lines={lines} onChange={setLines} showNotes priceMode={saleType} />
      </div>
      <div className="grid content-start gap-3 rounded-xl border border-slate-200 p-4">
        <p className="text-sm font-semibold text-slate-900">Summary</p>
        <p className="flex justify-between text-sm text-slate-700">
          <span>Subtotal</span>
          <span>{formatMoney(subtotal)}</span>
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
          <p className="text-xs text-slate-500">= {formatMoney(taxAmount)}{taxMode === "Amount" && subtotal > 0 ? ` (${((taxAmount / subtotal) * 100).toFixed(2)}%)` : ""}</p>
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
          <span>{formatMoney(total)}</span>
        </p>
        <button type="submit" disabled={lines.length === 0} className="btn btn-md btn-primary">
          Create Sale
        </button>
        {lines.length === 0 ? <p className="text-xs text-slate-500">Add at least one item before creating the sale.</p> : null}
      </div>
    </form>
  );
}
