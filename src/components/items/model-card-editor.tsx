"use client";

import Link from "next/link";
import { useEditableRow, type ActionResult } from "@/components/ui/editable-row";

type Model = {
  id: string;
  brand: string;
  modelName: string;
  lowStockThreshold: number;
  warrantyMonths: number;
  variants: { id: string; variantName: string; _count: { phones: number } }[];
};

export function ModelCardEditor({ model, updateAction }: { model: Model; updateAction: (formData: FormData) => Promise<ActionResult> }) {
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
          <button type="button" onClick={open} className="shrink-0 text-xs text-slate-700 underline">
            Edit
          </button>
        </div>
      )}
      <ul className="mt-2 space-y-1 text-sm text-slate-700">
        {model.variants.map((variant) => (
          <li key={variant.id}>
            <Link href={`/items/phones/variants/${variant.id}`} className="underline hover:text-slate-900">
              {variant.variantName} - In stock: {variant._count.phones}
            </Link>
          </li>
        ))}
        {!model.variants.length ? <li>No variants yet.</li> : null}
      </ul>
    </div>
  );
}
