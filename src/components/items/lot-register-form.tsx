"use client";

import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { VariantPicker, variantDisplayLabel, type VariantPickerOption, type CreateVariantResult } from "@/components/items/variant-picker";
import type { QuickAdd } from "@/components/ui/searchable-select";
import { ImeiConflictNotice, type ImeiOwner } from "@/components/items/imei-conflict-notice";
import { FxAmountField } from "@/components/ui/fx-amount-field";
import { formatMoney } from "@/lib/currency";


const GRADES = ["A", "B", "C"] as const;

export type BatchLine = {
  variantId: string;
  variantLabel: string;
  imei: string;
  purchasePrice: number;
  wholesalePrice: number;
  retailPrice: number;
  tagCost: number;
  batteryCost: number;
  grade: string;
  batteryHealth: number | null;
  notes: string | null;
};

type Props = {
  variants: VariantPickerOption[];
  /** Live IMEIs (lower-cased) → the unit holding each, for instant duplicate explanations. */
  imeiOwners: Record<string, ImeiOwner>;
  showCost: boolean;
  /** Grading is a physical-inspection step that only makes sense once a lot has
   * cleared customs — while false, the Grade selector is hidden and units register
   * as "Not Graded" until someone grades them later. */
  allowGrading: boolean;
  action: (formData: FormData) => void | Promise<void>;
  createVariant: (formData: FormData) => Promise<CreateVariantResult>;
  models: { id: string; label: string }[];
  modelQuickAdd?: QuickAdd;
};

export function LotRegisterForm({ variants, imeiOwners, showCost, allowGrading, action, createVariant, models, modelQuickAdd }: Props) {
  const [variantId, setVariantId] = useState("");
  // Kept separately so a variant created from the picker can be used before the page's
  // variant list refreshes.
  const [selectedVariant, setSelectedVariant] = useState<VariantPickerOption | null>(null);
  const [imei, setImei] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("0");
  const [wholesalePrice, setWholesalePrice] = useState("0");
  const [retailPrice, setRetailPrice] = useState("0");
  const [addTagCost, setAddTagCost] = useState(false);
  const [tagCost, setTagCost] = useState("0");
  const [addBatteryCost, setAddBatteryCost] = useState(false);
  const [batteryCost, setBatteryCost] = useState("0");
  const [grade, setGrade] = useState("A");
  const [batteryHealth, setBatteryHealth] = useState("");
  const [notes, setNotes] = useState("");
  const [batch, setBatch] = useState<BatchLine[]>([]);
  const imeiInputRef = useRef<HTMLInputElement>(null);

  const typedImei = imei.trim();
  const imeiOwner = typedImei ? imeiOwners[typedImei.toLowerCase()] ?? null : null;
  const batchIndex = typedImei ? batch.findIndex((line) => line.imei.trim().toLowerCase() === typedImei.toLowerCase()) : -1;
  const imeiBlocked = Boolean(imeiOwner) || batchIndex >= 0;

  function selectVariant(variant: VariantPickerOption) {
    setVariantId(variant.id);
    setSelectedVariant(variant);
    // Pre-fill from this variant's defaults so the user only has to override, not retype.
    if (variant && addTagCost) setTagCost(String(variant.defaultTagCost ?? 0));
    if (variant && addBatteryCost) setBatteryCost(String(variant.defaultBatteryCost ?? 0));
  }

  function toggleTagCost(checked: boolean) {
    setAddTagCost(checked);
    if (checked) {
      const variant = variants.find((option) => option.id === variantId) ?? (selectedVariant?.id === variantId ? selectedVariant : undefined);
      setTagCost(String(variant?.defaultTagCost ?? 0));
    }
  }

  function toggleBatteryCost(checked: boolean) {
    setAddBatteryCost(checked);
    if (checked) {
      const variant = variants.find((option) => option.id === variantId) ?? (selectedVariant?.id === variantId ? selectedVariant : undefined);
      setBatteryCost(String(variant?.defaultBatteryCost ?? 0));
    }
  }

  function addToBatch() {
    const trimmedImei = imei.trim();
    const variant = variants.find((option) => option.id === variantId) ?? (selectedVariant?.id === variantId ? selectedVariant : undefined);
    if (!variant) {
      toast.error("Select a variant first");
      return;
    }
    if (!trimmedImei) {
      toast.error("Enter an IMEI");
      return;
    }
    if (imeiBlocked) {
      // The reason (and the phone holding it) is shown under the IMEI field.
      toast.error(imeiOwner ? `IMEI ${trimmedImei} is already registered to another phone` : `IMEI ${trimmedImei} is already in this batch`);
      imeiInputRef.current?.focus();
      return;
    }

    setBatch((current) => [
      ...current,
      {
        variantId: variant.id,
        variantLabel: variantDisplayLabel(variant),
        imei: trimmedImei,
        purchasePrice: Number(purchasePrice) || 0,
        wholesalePrice: Number(wholesalePrice) || 0,
        retailPrice: Number(retailPrice) || 0,
        tagCost: addTagCost ? Number(tagCost) || 0 : 0,
        batteryCost: addBatteryCost ? Number(batteryCost) || 0 : 0,
        grade: allowGrading ? grade : "",
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
        <label className="grid min-w-0 gap-1 text-sm text-slate-700">
          Phone variant
          <VariantPicker variants={variants} value={variantId} onChange={selectVariant} create={{ action: createVariant, models, modelQuickAdd }} />
        </label>
        <label className="grid min-w-0 gap-1 text-sm text-slate-700">
          IMEI
          <input
            ref={imeiInputRef}
            value={imei}
            onChange={(event) => setImei(event.target.value)}
            placeholder="Scan or type IMEI"
            aria-invalid={imeiBlocked}
            onKeyDown={(event) => {
              // Scanners send Enter after the code: add to the batch instead of submitting.
              if (event.key === "Enter") {
                event.preventDefault();
                addToBatch();
              }
            }}
            className={`w-full min-w-0 rounded-lg border bg-white px-3 py-2 ${imeiBlocked ? "border-red-400 ring-2 ring-red-100" : "border-slate-300"}`}
          />
        </label>
        {imeiBlocked ? (
          <div className="md:col-span-2 xl:col-span-4">
            <ImeiConflictNotice imei={typedImei} owner={imeiOwner} batchLine={batchIndex >= 0 ? batchIndex + 1 : null} />
          </div>
        ) : null}
        {allowGrading ? (
          <label className="grid min-w-0 gap-1 text-sm text-slate-700">
            Grade
            <select value={grade} onChange={(event) => setGrade(event.target.value)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2">
              {GRADES.map((value) => (
                <option key={value} value={value}>
                  Grade {value}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="grid min-w-0 content-end text-sm text-slate-500">Not Graded (grade once Cleared)</p>
        )}
        <label className="grid min-w-0 gap-1 text-sm text-slate-700">
          Battery health %
          <input
            type="number"
            min={0}
            max={100}
            value={batteryHealth}
            onChange={(event) => setBatteryHealth(event.target.value)}
            placeholder="e.g. 95"
            className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2"
          />
        </label>
        {showCost ? (
          <>
            <FxAmountField label="Purchase price" value={purchasePrice} onChange={setPurchasePrice} />
            <label className="grid min-w-0 gap-1 text-sm text-slate-700">
              Wholesale price
              <input type="number" step="0.01" min={0} value={wholesalePrice} onChange={(event) => setWholesalePrice(event.target.value)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
            </label>
          </>
        ) : null}
        <label className="grid min-w-0 gap-1 text-sm text-slate-700">
          Retail price
          <input type="number" step="0.01" min={0} value={retailPrice} onChange={(event) => setRetailPrice(event.target.value)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
        </label>
        {showCost ? (
          <>
            <div className="grid min-w-0 gap-1">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={addTagCost} onChange={(event) => toggleTagCost(event.target.checked)} />
                Add tag cost
              </label>
              <FxAmountField label="Tag cost" value={tagCost} onChange={setTagCost} disabled={!addTagCost} />
            </div>
            <div className="grid min-w-0 gap-1">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={addBatteryCost} onChange={(event) => toggleBatteryCost(event.target.checked)} />
                Add battery cost
              </label>
              <FxAmountField label="Battery cost" value={batteryCost} onChange={setBatteryCost} disabled={!addBatteryCost} />
            </div>
          </>
        ) : null}
        <label className="grid min-w-0 gap-1 text-sm text-slate-700 md:col-span-2 xl:col-span-2">
          Notes
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Shown to staff when selecting this unit in a sale"
            className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2"
          />
        </label>
      </div>
      <button type="button" onClick={addToBatch} disabled={imeiBlocked} className="justify-self-start disabled:cursor-not-allowed disabled:opacity-50 rounded-lg border border-dashed border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50">
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
                {showCost ? <th className="px-3 py-2">Tag</th> : null}
                {showCost ? <th className="px-3 py-2">Battery Cost</th> : null}
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
                  <td className="px-3 py-2">{line.grade || "Not Graded"}</td>
                  <td className="px-3 py-2">{line.batteryHealth !== null ? `${line.batteryHealth}%` : "-"}</td>
                  {showCost ? <td className="px-3 py-2">{formatMoney(line.purchasePrice)}</td> : null}
                  <td className="px-3 py-2">{formatMoney(line.retailPrice)}</td>
                  {showCost ? <td className="px-3 py-2">{line.tagCost ? formatMoney(line.tagCost) : "-"}</td> : null}
                  {showCost ? <td className="px-3 py-2">{line.batteryCost ? formatMoney(line.batteryCost) : "-"}</td> : null}
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
