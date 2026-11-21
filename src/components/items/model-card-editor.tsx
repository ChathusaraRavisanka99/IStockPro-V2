"use client";

import Link from "next/link";
import { useEditableRow, type ActionResult } from "@/components/ui/editable-row";
import { DeleteVariantButton } from "@/components/items/delete-variant-button";
import { ConfirmActionButton } from "@/components/ui/confirm-action-button";

type Model = {
  id: string;
  brand: string;
  modelName: string;
  lowStockThreshold: number;
  warrantyMonths: number;
  variants: { id: string; variantName: string; color: string | null; storage: string | null; ram: string | null; _count: { phones: number } }[];
};

type Options = { colors: string[]; storages: string[]; rams: string[] };

function OptionRow({ label, values, tone }: { label: string; values: string[]; tone: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="w-14 shrink-0 text-xs text-slate-500">{label}</span>
      {values.length ? values.map((value) => <span key={value} className={`rounded px-1.5 py-0.5 text-xs ${tone}`}>{value}</span>) : <span className="text-xs text-slate-400">-</span>}
    </div>
  );
}

export function ModelCardEditor({
  model,
  options,
  optionsMode,
  updateAction,
  deleteVariantAction,
  deleteModelAction,
}: {
  model: Model;
  options: Options;
  optionsMode: "stock" | "all";
  updateAction: (formData: FormData) => Promise<ActionResult>;
  deleteVariantAction: (formData: FormData) => Promise<ActionResult>;
  deleteModelAction: (formData: FormData) => Promise<ActionResult>;
}) {
  const { editing, error, pending, open, cancel, handleSubmit } = useEditableRow(updateAction);

  return (
    <div className="rounded-xl border border-slate-300 bg-white px-4 py-3">
      {editing ? (
        <form onSubmit={handleSubmit} className="grid gap-2">
          <input type="hidden" name="id" value={model.id} />
          <div className="grid grid-cols-2 gap-2">
            <label className="grid min-w-0 gap-1 text-xs text-slate-600">
              Brand
              <input name="brand" required defaultValue={model.brand} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-slate-600">
              Model name
              <input name="modelName" required defaultValue={model.modelName} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid min-w-0 gap-1 text-xs text-slate-600">
              Low stock threshold
              <input name="lowStockThreshold" type="number" min={0} defaultValue={model.lowStockThreshold} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-slate-600">
              Warranty (months)
              <input name="warrantyMonths" type="number" min={0} defaultValue={model.warrantyMonths} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
            </label>
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
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-slate-900">
              {model.brand} {model.modelName}
            </p>
            <p className="text-xs text-slate-600">Warranty {model.warrantyMonths} months | Threshold {model.lowStockThreshold}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={open} className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 transition hover:bg-slate-50">
              Edit
            </button>
            <ConfirmActionButton
              label="Delete"
              title={`Delete ${model.brand} ${model.modelName}?`}
              message={
                <>
                  <p>The model and its {model.variants.length} variant{model.variants.length === 1 ? "" : "s"} move to the Recycle Bin for 30 days, then are permanently deleted. Sold units keep their history.</p>
                  <p className="mt-2 text-xs text-slate-500">Not allowed while any variant still has units in stock — move those variants to another model first (Edit on the variant page).</p>
                </>
              }
              confirmLabel="Delete model"
              fields={{ id: model.id }}
              action={deleteModelAction}
            />
          </div>
        </div>
      )}
      <div className="mt-2 grid gap-1 rounded-lg bg-slate-50 px-2 py-1.5">
        <p className="text-[11px] font-semibold uppercase text-slate-500">{optionsMode === "stock" ? "Available options (in stock)" : "All options"}</p>
        <OptionRow label="Color" values={options.colors} tone="bg-rose-50 text-rose-800" />
        <OptionRow label="Storage" values={options.storages} tone="bg-sky-50 text-sky-800" />
        <OptionRow label="RAM" values={options.rams} tone="bg-violet-50 text-violet-800" />
      </div>
      <ul className="mt-2 space-y-1 text-sm text-slate-700">
        {model.variants.map((variant) => (
          <li key={variant.id} className="flex items-start justify-between gap-2">
            <Link href={`/items/phones/variants/${variant.id}`} className="underline hover:text-slate-900">
              {variant.variantName}
              {[variant.color, variant.storage, variant.ram ? `${variant.ram} RAM` : null].filter(Boolean).length ? (
                <span className="text-slate-500"> ({[variant.color, variant.storage, variant.ram ? `${variant.ram} RAM` : null].filter(Boolean).join(" · ")})</span>
              ) : null}{" "}
              - In stock: {variant._count.phones}
            </Link>
            <DeleteVariantButton variantId={variant.id} variantName={variant.variantName} deleteAction={deleteVariantAction} />
          </li>
        ))}
        {!model.variants.length ? <li>No variants yet.</li> : null}
      </ul>
    </div>
  );
}
