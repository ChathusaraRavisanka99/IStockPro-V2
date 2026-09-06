"use client";

import { useState } from "react";

type Props = {
  name: string;
  label: string;
  defaultValue?: number;
};

/**
 * Amount input that always submits a canonical LKR value under `name`. A "Foreign
 * currency?" toggle reveals currency/foreign-amount/rate inputs; while it's on, the LKR
 * field becomes a read-only live-computed preview (foreignAmount * rate) so the server
 * action never has to special-case the field's shape. When foreign entry is used, the
 * breakdown is also submitted as JSON under a hidden `__fx_<name>` field for the server
 * action to store as an audit trail (Lot.fxDetails) — never read back into calculations.
 */
export function FxAmountInput({ name, label, defaultValue = 0 }: Props) {
  const [foreign, setForeign] = useState(false);
  const [currency, setCurrency] = useState("");
  const [foreignAmount, setForeignAmount] = useState<number | "">("");
  const [rate, setRate] = useState<number | "">("");
  const [amount, setAmount] = useState<number | "">(defaultValue);

  const computed = typeof foreignAmount === "number" && typeof rate === "number" ? foreignAmount * rate : null;
  const fxPayload =
    foreign && currency.trim() && typeof foreignAmount === "number" && typeof rate === "number"
      ? JSON.stringify({ currency: currency.trim(), foreignAmount, rate })
      : "";

  return (
    <div className="grid min-w-0 gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-slate-700">{label} (LKR)</span>
        <label className="flex items-center gap-1 text-xs text-slate-500">
          <input type="checkbox" checked={foreign} onChange={(e) => setForeign(e.target.checked)} />
          Foreign currency?
        </label>
      </div>
      <input
        name={name}
        type="number"
        step="0.01"
        min={0}
        readOnly={foreign}
        value={foreign ? (computed ?? "") : amount}
        onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
        className={`w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 ${foreign ? "bg-slate-100" : "bg-white"}`}
      />
      {foreign ? (
        <div className="grid grid-cols-3 gap-2">
          <input
            placeholder="Currency (e.g. JPY)"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
          />
          <input
            type="number"
            step="0.01"
            placeholder="Foreign amount"
            value={foreignAmount}
            onChange={(e) => setForeignAmount(e.target.value === "" ? "" : Number(e.target.value))}
            className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
          />
          <input
            type="number"
            step="0.0001"
            placeholder="Rate to LKR"
            value={rate}
            onChange={(e) => setRate(e.target.value === "" ? "" : Number(e.target.value))}
            className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
          />
        </div>
      ) : null}
      <input type="hidden" name={`__fx_${name}`} value={fxPayload} />
    </div>
  );
}
