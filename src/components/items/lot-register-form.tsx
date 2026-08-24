"use client";

import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { SearchableSelect, type QuickAdd } from "@/components/ui/searchable-select";

type Option = { value: string; label: string };

const GRADES = ["A", "B", "C"] as const;

export type BatchLine = {
  variantId: string;
  variantLabel: string;
  imei: string;
  purchasePrice: number;
  wholesalePrice: number;
  retailPrice: number;
  grade: string;
  batteryHealth: number | null;
  notes: string | null;
};

type Props = {
  variants: Option[];
  existingImeis: string[];
  showCost: boolean;
  action: (formData: FormData) => void | Promise<void>;
  variantQuickAdd: QuickAdd;
};

export function LotRegisterForm({ variants, existingImeis, showCost, action, variantQuickAdd }: Props) {
  const [variantId, setVariantId] = useState("");
  const [imei, setImei] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("0");
  const [wholesalePrice, setWholesalePrice] = useState("0");
  const [retailPrice, setRetailPrice] = useState("0");
  const [grade, setGrade] = useState("A");
  const [batteryHealth, setBatteryHealth] = useState("");
  const [notes, setNotes] = useState("");
  const [batch, setBatch] = useState<BatchLine[]>([]);
  const imeiInputRef = useRef<HTMLInputElement>(null);

  const existingSet = new Set(existingImeis.map((value) => value.trim().toLowerCase()));

  function addToBatch() {
    const trimmedImei = imei.trim();
    const variant = variants.find((option) => option.value === variantId);
    if (!variant) {
      toast.error("Select a variant first");
      return;
    }
    if (!trimmedImei) {
      toast.error("Enter an IMEI");
      return;
    }
    const normalized = trimmedImei.toLowerCase();
    if (existingSet.has(normalized) || batch.some((line) => line.imei.trim().toLowerCase() === normalized)) {
      toast.error(`IMEI ${trimmedImei} is already registered`);
      return;
    }

    setBatch((current) => [
      ...current,
      {
        variantId: variant.value,
        variantLabel: variant.label,
        imei: trimmedImei,
        purchasePrice: Number(purchasePrice) || 0,
        wholesalePrice: Number(wholesalePrice) || 0,
        retailPrice: Number(retailPrice) || 0,
        grade,
        batteryHealth: batteryHealth.trim() ? Math.max(0, Math.min(100, Number(batteryHealth))) : null,
        notes: notes.trim() || null,
      },
    ]);
    // Keep the variant, prices, and grade selected so registering several units of the same
    // product is just: type the next IMEI, click Add, repeat. Battery health and notes are
    // unit-specific, so those clear each time.
    setImei("");
    setBatteryHealth("");
    setNotes("");
    imeiInputRef.current?.focus();
  }

  function removeLine(index: number) {
    setBatch((current) => current.filter((_, i) => i !== index));
  }

  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="batchItems" value={JSON.stringify(batch)} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SearchableSelect placeholder="Select variant" options={variants} onChange={setVariantId} quickAdd={variantQuickAdd} />
        <input
          ref={imeiInputRef}
          value={imei}
          onChange={(event) => setImei(event.target.value)}
          placeholder="IMEI"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2"
        />
        <select value={grade} onChange={(event) => setGrade(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2">
          {GRADES.map((value) => (
            <option key={value} value={value}>
              Grade {value}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={0}
          max={100}
          value={batteryHealth}
          onChange={(event) => setBatteryHealth(event.target.value)}
          placeholder="Battery health %"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2"
        />
        {showCost ? (
          <>
            <input type="number" step="0.01" min={0} value={purchasePrice} onChange={(event) => setPurchasePrice(event.target.value)} placeholder="Purchase price" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
            <input type="number" step="0.01" min={0} value={wholesalePrice} onChange={(event) => setWholesalePrice(event.target.value)} placeholder="Wholesale price" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          </>
        ) : null}
        <input type="number" step="0.01" min={0} value={retailPrice} onChange={(event) => setRetailPrice(event.target.value)} placeholder="Retail price" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
        <input
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Notes (shown to staff when selecting this unit in a sale)"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 md:col-span-2 xl:col-span-2"
        />
      </div>
      <button type="button" onClick={addToBatch} className="justify-self-start rounded-lg border border-dashed border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50">
        + Add to Batch
      </button>

      {batch.length ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-700">
                <th className="px-3 py-2">Variant</th>
                <th className="px-3 py-2">IMEI</th>
                <th className="px-3 py-2">Grade</th>
                <th className="px-3 py-2">Battery</th>
                {showCost ? <th className="px-3 py-2">Purchase</th> : null}
                <th className="px-3 py-2">Retail</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {batch.map((line, index) => (
                <tr key={`${line.imei}-${index}`} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2">
                    {line.variantLabel}
                    {line.notes ? <p className="mt-0.5 text-xs italic text-slate-500">{line.notes}</p> : null}
                  </td>
                  <td className="px-3 py-2">{line.imei}</td>
                  <td className="px-3 py-2">{line.grade}</td>
                  <td className="px-3 py-2">{line.batteryHealth !== null ? `${line.batteryHealth}%` : "-"}</td>
                  {showCost ? <td className="px-3 py-2">${line.purchasePrice.toFixed(2)}</td> : null}
                  <td className="px-3 py-2">${line.retailPrice.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => removeLine(index)} className="text-xs text-red-700 underline">
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-center text-sm text-slate-500">No phones queued yet — add units above to build a batch, then register them all at once.</p>
      )}

      <button
        type="submit"
        disabled={!batch.length}
        className="justify-self-start rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        Register {batch.length || ""} Phone{batch.length === 1 ? "" : "s"}
      </button>
    </form>
  );
}
