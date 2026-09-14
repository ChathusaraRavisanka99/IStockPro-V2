"use client";

import { useState } from "react";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

/**
 * Controlled counterpart to FxAmountInput, for forms that hold their own React state
 * (batch entry, not a plain named form field) — e.g. per-unit prices in
 * LotRegisterForm. Same "Foreign currency?" toggle, no currency identifier, just a
 * foreign amount + rate that compute the canonical LKR value passed to onChange.
 */
export function FxAmountField({ label, value, onChange, disabled }: Props) {
  const [foreign, setForeign] = useState(false);
  const [foreignAmount, setForeignAmount] = useState<number | "">("");
  const [rate, setRate] = useState<number | "">("");

  function updateForeignAmount(next: number | "") {
    setForeignAmount(next);
    if (typeof next === "number" && typeof rate === "number") onChange(String(next * rate));
  }

  function updateRate(next: number | "") {
    setRate(next);
    if (typeof foreignAmount === "number" && typeof next === "number") onChange(String(foreignAmount * next));
  }

  function toggleForeign(checked: boolean) {
    setForeign(checked);
    if (!checked) return;
    if (typeof foreignAmount === "number" && typeof rate === "number") onChange(String(foreignAmount * rate));
  }

  return (
    <div className="grid min-w-0 gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-slate-700">{label}</span>
        <label className="flex items-center gap-1 text-xs text-slate-500">
          <input type="checkbox" checked={foreign} disabled={disabled} onChange={(e) => toggleForeign(e.target.checked)} />
          Foreign currency?
        </label>
      </div>
      <input
        type="number"
        step="0.01"
        min={0}
        readOnly={foreign}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 ${foreign ? "bg-slate-100" : "bg-white"}`}
      />
      {foreign ? (
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            step="0.01"
            placeholder="Foreign amount"
            value={foreignAmount}
            onChange={(e) => updateForeignAmount(e.target.value === "" ? "" : Number(e.target.value))}
            className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
          />
          <input
            type="number"
            step="0.0001"
            placeholder="Rate to LKR"
            value={rate}
            onChange={(e) => updateRate(e.target.value === "" ? "" : Number(e.target.value))}
            className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
          />
        </div>
      ) : null}
    </div>
  );
}
