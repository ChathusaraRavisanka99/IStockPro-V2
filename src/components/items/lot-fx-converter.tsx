"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type FxState = { currency: string; rate: number | null };

const FxContext = createContext<FxState>({ currency: "", rate: null });
const STORAGE_KEY = "lots-fx-converter";

/**
 * View-only currency converter for the lot list: the user enters a currency code and its
 * rate to LKR, and every <LotFxAmount> inside shows the LKR figure converted to that
 * currency. Nothing is saved to the lots themselves; the last-used rate is remembered
 * per browser.
 */
export function LotFxConverter({ children }: { children: ReactNode }) {
  const [currency, setCurrency] = useState("USD");
  const [rateInput, setRateInput] = useState("");

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
      if (saved?.currency) setCurrency(saved.currency);
      if (saved?.rate) setRateInput(String(saved.rate));
    } catch {
      // storage unavailable: start blank
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ currency, rate: rateInput }));
    } catch {
      // ignore
    }
  }, [currency, rateInput]);

  const parsed = Number(rateInput);
  const rate = rateInput.trim() && Number.isFinite(parsed) && parsed > 0 ? parsed : null;

  return (
    <FxContext.Provider value={{ currency: currency.trim().toUpperCase(), rate }}>
      <div className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <p className="w-full text-xs font-semibold uppercase text-slate-500 sm:w-auto sm:self-center">Foreign currency view</p>
        <label className="grid gap-1 text-xs text-slate-600">
          Currency
          <input value={currency} onChange={(event) => setCurrency(event.target.value)} maxLength={5} placeholder="USD" className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm uppercase" />
        </label>
        <label className="grid gap-1 text-xs text-slate-600">
          LKR per 1 {currency.trim().toUpperCase() || "unit"}
          <input type="number" min={0} step="0.0001" value={rateInput} onChange={(event) => setRateInput(event.target.value)} placeholder="e.g. 300" className="w-32 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
        </label>
        {rate ? (
          <button type="button" onClick={() => setRateInput("")} className="text-xs text-slate-600 underline">
            Clear
          </button>
        ) : (
          <p className="text-xs text-slate-500">Enter a rate to see each lot&apos;s spend in that currency.</p>
        )}
      </div>
      {children}
    </FxContext.Provider>
  );
}

export function LotFxAmount({ lkr }: { lkr: number }) {
  const { currency, rate } = useContext(FxContext);
  if (!rate) return <span className="text-slate-400">-</span>;
  const value = lkr / rate;
  return (
    <span>
      {currency || "FX"} {value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}

export function LotFxHeader() {
  const { currency } = useContext(FxContext);
  return <>Total ({currency || "FX"})</>;
}
