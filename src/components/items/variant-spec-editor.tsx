"use client";

import { formatMoney } from "@/lib/currency";
import { useEditableRow, type ActionResult } from "@/components/ui/editable-row";

type Variant = {
  variantName: string;
  color: string | null;
  storage: string | null;
  ram: string | null;
  screenSize: string | null;
  processor: string | null;
  camera: string | null;
  os: string | null;
  networkType: string | null;
  battery: string | null;
  defaultTagCost: unknown;
  defaultBatteryCost: unknown;
};

export function VariantSpecEditor({ variant, showCost, updateAction }: { variant: Variant; showCost: boolean; updateAction: (formData: FormData) => Promise<ActionResult> }) {
  const { editing, error, pending, open, cancel, handleSubmit } = useEditableRow(updateAction);

  const specs: [string, string | null][] = [
    ["Color", variant.color],
    ["Storage (ROM)", variant.storage],
    ["RAM", variant.ram],
    ["Screen size", variant.screenSize],
    ["Processor", variant.processor],
    ["Camera", variant.camera],
    ["OS", variant.os],
    ["Network", variant.networkType],
    ["Battery", variant.battery],
  ];
  const presentSpecs = specs.filter(([, value]) => value);

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Specifications</h2>
        {!editing ? (
          <button type="button" onClick={open} className="text-sm text-slate-700 underline">
            Edit
          </button>
        ) : null}
      </div>
      {editing ? (
        <form onSubmit={handleSubmit} className="grid gap-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <label className="grid min-w-0 gap-1 text-xs text-slate-600">
              Variant name
              <input name="variantName" required defaultValue={variant.variantName} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-slate-600">
              Color
              <input name="color" defaultValue={variant.color || ""} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-slate-600">
              Storage (ROM)
              <input name="storage" defaultValue={variant.storage || ""} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-slate-600">
              RAM
              <input name="ram" defaultValue={variant.ram || ""} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-slate-600">
              Screen size
              <input name="screenSize" defaultValue={variant.screenSize || ""} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-slate-600">
              Processor
              <input name="processor" defaultValue={variant.processor || ""} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-slate-600">
              Camera
              <input name="camera" defaultValue={variant.camera || ""} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-slate-600">
              OS
              <input name="os" defaultValue={variant.os || ""} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-slate-600">
              Network
              <input name="networkType" defaultValue={variant.networkType || ""} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-slate-600">
              Battery
              <input name="battery" defaultValue={variant.battery || ""} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
            </label>
            {showCost ? (
              <>
                <label className="grid min-w-0 gap-1 text-xs text-slate-600">
                  Default tag cost
                  <input name="defaultTagCost" type="number" step="0.01" min={0} defaultValue={Number(variant.defaultTagCost)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
                </label>
                <label className="grid min-w-0 gap-1 text-xs text-slate-600">
                  Default battery cost
                  <input name="defaultBatteryCost" type="number" step="0.01" min={0} defaultValue={Number(variant.defaultBatteryCost)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
                </label>
              </>
            ) : null}
          </div>
          {error ? <p className="text-xs text-red-700">{error}</p> : null}
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="rounded-md bg-slate-900 px-3 py-1 text-xs text-white disabled:opacity-60">
              {pending ? "Saving..." : "Save"}
            </button>
            <button type="button" onClick={cancel} className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700">
              Cancel
            </button>
          </div>
        </form>
      ) : presentSpecs.length ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          {presentSpecs.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt>
              <dd className="text-slate-900">{value}</dd>
            </div>
          ))}
          {showCost ? (
            <>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-500">Default tag cost</dt>
                <dd className="text-slate-900">{formatMoney(variant.defaultTagCost)}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-500">Default battery cost</dt>
                <dd className="text-slate-900">{formatMoney(variant.defaultBatteryCost)}</dd>
              </div>
            </>
          ) : null}
        </dl>
      ) : (
        <p className="text-sm text-slate-600">No specifications recorded yet.</p>
      )}
    </>
  );
}
