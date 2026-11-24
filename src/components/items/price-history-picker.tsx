"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Search } from "lucide-react";
import { Modal, modalButton, modalField } from "@/components/ui/modal";
import { SpecChips } from "@/components/ui/spec-chips";

export type PriceHistoryModel = {
  id: string;
  brand: string;
  modelName: string;
  variants: { id: string; variantName: string; color: string | null; storage: string | null; ram: string | null; changes: number }[];
};

/**
 * "Show price over time for" — opens a popup to search models/variants (name, color, storage),
 * filter by brand and to ones with price changes, then pick a whole model or one variant.
 */
export function PriceHistoryPicker({ models, value, label }: { models: PriceHistoryModel[]; value: string; label: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("");
  const [changedOnly, setChangedOnly] = useState(false);

  const brands = useMemo(() => Array.from(new Set(models.map((model) => model.brand))), [models]);
  const filtered = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return models
      .filter((model) => !brand || model.brand === brand)
      .map((model) => {
        const modelText = `${model.brand} ${model.modelName}`.toLowerCase();
        const variants = model.variants.filter((variant) => {
          if (changedOnly && !variant.changes) return false;
          const text = `${modelText} ${variant.variantName} ${variant.color ?? ""} ${variant.storage ?? ""} ${variant.ram ?? ""}`.toLowerCase();
          return words.every((word) => text.includes(word));
        });
        return { ...model, variants };
      })
      .filter((model) => model.variants.length || (!changedOnly && words.every((word) => `${model.brand} ${model.modelName}`.toLowerCase().includes(word))));
  }, [models, query, brand, changedOnly]);

  function pick(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("sel", next);
    else params.delete("sel");
    params.delete("page");
    setOpen(false);
    router.push(`${pathname}${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm">
        <span className={`min-w-0 truncate ${label ? "font-medium text-slate-900" : "text-slate-500"}`}>{label ?? "Choose a phone model or variant…"}</span>
        <ChevronDown className="size-4 shrink-0 text-slate-500" />
      </button>
      {open ? (
        <Modal
          title="Choose a phone model or variant"
          subtitle="Pick a whole model to compare all its variants, or one variant."
          size="lg"
          flush
          onClose={() => setOpen(false)}
          footer={
            <div className="flex w-full flex-wrap justify-between gap-2">
              {value ? <button type="button" className={modalButton.secondary} onClick={() => pick("")}>Clear selection</button> : <span />}
              <button type="button" className={modalButton.secondary} onClick={() => setOpen(false)}>Close</button>
            </div>
          }
        >
          <div className="sticky top-0 z-10 grid gap-2 border-b border-slate-200 bg-white p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search model, color, storage…" className={`${modalField.input} pl-8`} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button type="button" onClick={() => setBrand("")} className={`rounded-full border px-2.5 py-1 ${!brand ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"}`}>All brands</button>
              {brands.map((name) => (
                <button key={name} type="button" onClick={() => setBrand(name)} className={`rounded-full border px-2.5 py-1 ${brand === name ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"}`}>
                  {name}
                </button>
              ))}
              <label className="ml-auto flex items-center gap-1.5 text-slate-600">
                <input type="checkbox" checked={changedOnly} onChange={(event) => setChangedOnly(event.target.checked)} />
                Only with price changes
              </label>
            </div>
          </div>
          <div className="grid gap-3 p-3">
            {filtered.map((model) => (
              <section key={model.id} className="rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => pick(`m:${model.id}`)}
                  className={`flex w-full items-center justify-between gap-2 rounded-t-xl px-3 py-2 text-left hover:bg-slate-50 ${value === `m:${model.id}` ? "bg-slate-100" : ""}`}
                >
                  <span className="min-w-0">
                    <span className="block font-semibold text-slate-900">{model.brand} {model.modelName}</span>
                    <span className="text-xs text-slate-500">All {model.variants.length} variant{model.variants.length === 1 ? "" : "s"} compared</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">Whole model</span>
                </button>
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  {model.variants.map((variant) => (
                    <li key={variant.id}>
                      <button
                        type="button"
                        onClick={() => pick(`v:${variant.id}`)}
                        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 ${value === `v:${variant.id}` ? "bg-slate-100" : ""}`}
                      >
                        <span className="min-w-0">
                          <span className="block text-slate-800">{variant.variantName}</span>
                          <SpecChips color={variant.color} storage={variant.storage} ram={variant.ram} className="mt-0.5 flex" />
                        </span>
                        <span className="shrink-0 text-xs text-slate-500">{variant.changes ? `${variant.changes} change${variant.changes === 1 ? "" : "s"}` : "no changes"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {!filtered.length ? <p className="py-6 text-center text-sm text-slate-600">Nothing matches.</p> : null}
          </div>
        </Modal>
      ) : null}
    </>
  );
}
