"use client";

import { useState } from "react";
import { SearchableSelect } from "@/components/ui/searchable-select";

export type CartLine = { key: string; label: string; unitPrice: number; quantity: number; maxQuantity?: number; notes?: string | null };
type ItemOption = { value: string; label: string; price: number; maxQuantity?: number; notes?: string | null; category?: string };

type Props = {
  items: ItemOption[];
  lines: CartLine[];
  onChange: (lines: CartLine[]) => void;
  fieldName?: string;
  showNotes?: boolean;
};

export function CartBuilder({ items, lines, onChange, fieldName = "cartItems", showNotes = false }: Props) {
  const [pickerKey, setPickerKey] = useState("");
  const [pickerQty, setPickerQty] = useState("1");
  const [pickerResetCount, setPickerResetCount] = useState(0);
  const [activeCategory, setActiveCategory] = useState("All");

  const categories = ["All", ...Array.from(new Set(items.map((item) => item.category).filter((value): value is string => Boolean(value))))];
  const visibleItems = activeCategory === "All" ? items : items.filter((item) => item.category === activeCategory);

  const pickerItem = items.find((option) => option.value === pickerKey);
  const pickerAlreadyInCart = lines.find((line) => line.key === pickerKey)?.quantity ?? 0;
  const pickerRemaining = pickerItem?.maxQuantity !== undefined ? Math.max(0, pickerItem.maxQuantity - pickerAlreadyInCart) : undefined;

  function addToCart() {
    const item = items.find((option) => option.value === pickerKey);
    if (!item) return;
    const existingIndex = lines.findIndex((line) => line.key === item.value);
    const alreadyInCart = existingIndex >= 0 ? lines[existingIndex].quantity : 0;
    const remaining = item.maxQuantity !== undefined ? Math.max(0, item.maxQuantity - alreadyInCart) : Infinity;
    const qty = Math.min(Math.max(1, Number(pickerQty) || 1), remaining || 1);
    if (remaining <= 0) return;
    setPickerResetCount((count) => count + 1);
    if (existingIndex >= 0) {
      const next = [...lines];
      next[existingIndex] = { ...next[existingIndex], quantity: next[existingIndex].quantity + qty };
      onChange(next);
    } else {
      onChange([...lines, { key: item.value, label: item.label, unitPrice: item.price, quantity: qty, maxQuantity: item.maxQuantity, notes: item.notes }]);
    }
    setPickerKey("");
    setPickerQty("1");
  }

  function updateLine(key: string, patch: Partial<CartLine>) {
    onChange(
      lines.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...patch };
        if (next.maxQuantity !== undefined) next.quantity = Math.min(next.quantity, Math.max(1, next.maxQuantity));
        return next;
      }),
    );
  }

  function removeLine(key: string) {
    onChange(lines.filter((line) => line.key !== key));
  }

  return (
    <div className="grid gap-3">
      <input type="hidden" name={fieldName} value={JSON.stringify(lines)} />
      {categories.length > 2 ? (
        <div className="flex flex-wrap gap-1.5">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => {
                setActiveCategory(category);
                setPickerKey("");
                setPickerResetCount((count) => count + 1);
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                activeCategory === category ? "bg-slate-900 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchableSelect
          key={pickerResetCount}
          placeholder="Add an item"
          options={visibleItems.map((option) => {
            const inCart = lines.find((line) => line.key === option.value)?.quantity ?? 0;
            const remaining = option.maxQuantity !== undefined ? Math.max(0, option.maxQuantity - inCart) : undefined;
            return {
              value: option.value,
              label: `${option.label} - $${option.price.toFixed(2)}${remaining !== undefined ? ` (${remaining} available)` : ""}`,
            };
          })}
          onChange={setPickerKey}
        />
        <input
          type="number"
          min={1}
          max={pickerRemaining}
          value={pickerQty}
          onChange={(event) => setPickerQty(event.target.value)}
          aria-label="Quantity to add"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 sm:w-24"
        />
        <button type="button" onClick={addToCart} disabled={!pickerKey || pickerRemaining === 0} className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">
          Add
        </button>
      </div>

      {showNotes && pickerItem?.notes ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="font-semibold">Note:</span> {pickerItem.notes}
        </p>
      ) : null}

      {lines.length ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-700">
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Qty</th>
                <th className="px-3 py-2">Unit Price</th>
                <th className="px-3 py-2">Line Total</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.key} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2">
                    {line.label}
                    {showNotes && line.notes ? <p className="mt-0.5 text-xs italic text-amber-700">Note: {line.notes}</p> : null}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={1}
                      max={line.maxQuantity}
                      value={line.quantity}
                      onChange={(event) => {
                        const raw = Math.max(1, Number(event.target.value) || 1);
                        const clamped = line.maxQuantity !== undefined ? Math.min(raw, Math.max(1, line.maxQuantity)) : raw;
                        updateLine(line.key, { quantity: clamped });
                      }}
                      className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1"
                    />
                    {line.maxQuantity !== undefined ? <p className="mt-0.5 text-xs text-slate-500">of {line.maxQuantity}</p> : null}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.unitPrice}
                      onChange={(event) => updateLine(line.key, { unitPrice: Math.max(0, Number(event.target.value) || 0) })}
                      className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1"
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-slate-900">${(line.unitPrice * line.quantity).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => removeLine(line.key)} className="text-xs text-red-700 underline">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500">No items added yet.</p>
      )}
    </div>
  );
}
