"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, ChevronsUpDown, Plus, Search, Smartphone } from "lucide-react";
import { Modal, modalButton, modalField } from "@/components/ui/modal";
import { ColorChip, SpecChips } from "@/components/ui/spec-chips";
import { useRouter } from "next/navigation";
import { SearchableSelect, type QuickAdd } from "@/components/ui/searchable-select";
import { buildVariantName, compareSizes, normalizeColor, normalizeRam, normalizeStorage } from "@/lib/variant-specs";

export type VariantPickerOption = {
  id: string;
  phoneModelId: string;
  brand: string;
  modelName: string;
  variantName: string;
  color: string | null;
  storage: string | null;
  ram: string | null;
  /** Live in-stock units; enables the "In stock only" toggle when provided. */
  inStock?: number;
  defaultTagCost?: number;
  defaultBatteryCost?: number;
};

export type CreateVariantResult = { ok: true; id: string } | { ok: false; error: string };

type Props = {
  variants: VariantPickerOption[];
  value: string;
  onChange: (variant: VariantPickerOption) => void;
  /** Renders a hidden input so the picker works inside a plain <form>. */
  name?: string;
  placeholder?: string;
  /** Enables "+ Create new variant" as the last option in the list. */
  create?: {
    action: (formData: FormData) => Promise<CreateVariantResult>;
    models: { id: string; label: string }[];
    modelQuickAdd?: QuickAdd;
  };
};

export function variantDisplayLabel(variant: Pick<VariantPickerOption, "brand" | "modelName" | "variantName" | "color" | "storage" | "ram">) {
  const specs = [variant.color, variant.storage, variant.ram ? `${variant.ram} RAM` : null].filter(Boolean).join(" · ");
  return `${variant.brand} ${variant.modelName} - ${variant.variantName}${specs && specs !== variant.variantName ? ` (${specs})` : ""}`;
}

const uniqueSorted = (values: (string | null)[], sizes: boolean) => {
  const list = Array.from(new Set(values.filter((value): value is string => Boolean(value))));
  return sizes ? list.sort(compareSizes) : list.sort((a, b) => a.localeCompare(b));
};

function Chips({ label, options, value, onChange, colors }: { label: string; options: string[]; value: string; onChange: (value: string) => void; colors?: boolean }) {
  if (!options.length) return null;
  return (
    <div className="grid grid-cols-[3.75rem_1fr] items-start gap-2">
      <span className="pt-1 text-xs font-medium text-slate-500">{label}</span>
      <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = option === value;
        return (
          colors ? (
            <button key={option} type="button" onClick={() => onChange(active ? "" : option)} aria-pressed={active} className={`rounded-full transition ${value && !active ? "opacity-40 hover:opacity-100" : ""}`}>
              <ColorChip color={option} size="sm" active={active} />
            </button>
          ) : (
          <button
            key={option}
            type="button"
            onClick={() => onChange(active ? "" : option)}
            aria-pressed={active}
            className={`rounded-full border px-2.5 py-0.5 text-xs transition ${active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-500"}`}
          >
            {option}
          </button>
          )
        );
      })}
      </div>
    </div>
  );
}

/**
 * Popup variant chooser: free-text search plus hierarchical Model → Storage → RAM → Color
 * filters (each level only offers values that exist under the levels above), with
 * "Create new variant" as the last option, pre-filled from the current filters.
 */
export function VariantPicker({ variants, value, onChange, name, placeholder = "Select variant", create }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [modelId, setModelId] = useState("");
  const [storage, setStorage] = useState("");
  const [ram, setRam] = useState("");
  const [color, setColor] = useState("");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [newVariant, setNewVariant] = useState({ phoneModelId: "", variantName: "", storage: "", ram: "", color: "" });
  // A just-created variant isn't in `variants` until the page refreshes; remember its label.
  const [createdLabel, setCreatedLabel] = useState<{ id: string; label: string } | null>(null);

  const hasStock = variants.some((variant) => variant.inStock !== undefined);
  const selected = variants.find((variant) => variant.id === value);
  const selectedLabel = selected ? variantDisplayLabel(selected) : createdLabel?.id === value ? createdLabel.label : "";

  const models = useMemo(() => {
    const map = new Map<string, string>();
    for (const variant of variants) map.set(variant.phoneModelId, `${variant.brand} ${variant.modelName}`);
    return Array.from(map, ([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [variants]);

  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const base = variants.filter((variant) => {
    if (inStockOnly && !(variant.inStock ?? 0)) return false;
    if (!terms.length) return true;
    const haystack = `${variant.brand} ${variant.modelName} ${variant.variantName} ${variant.color ?? ""} ${variant.storage ?? ""} ${variant.ram ?? ""}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
  // Each level narrows the options offered by the next one.
  const byModel = modelId ? base.filter((variant) => variant.phoneModelId === modelId) : base;
  const storageOptions = uniqueSorted(byModel.map((variant) => variant.storage), true);
  const byStorage = storage ? byModel.filter((variant) => variant.storage === storage) : byModel;
  const ramOptions = uniqueSorted(byStorage.map((variant) => variant.ram), true);
  const byRam = ram ? byStorage.filter((variant) => variant.ram === ram) : byStorage;
  const colorOptions = uniqueSorted(byRam.map((variant) => variant.color), false);
  const results = (color ? byRam.filter((variant) => variant.color === color) : byRam).sort((a, b) =>
    `${a.brand} ${a.modelName}`.localeCompare(`${b.brand} ${b.modelName}`) || compareSizes(a.storage ?? "", b.storage ?? "") || (a.color ?? "").localeCompare(b.color ?? "")
  );

  const groups = new Map<string, VariantPickerOption[]>();
  for (const variant of results) groups.set(variant.phoneModelId, [...(groups.get(variant.phoneModelId) ?? []), variant]);

  function reset() {
    setSearch("");
    setModelId("");
    setStorage("");
    setRam("");
    setColor("");
    setCreating(false);
    setCreateError(null);
  }

  function choose(variant: VariantPickerOption) {
    onChange(variant);
    setOpen(false);
    reset();
  }

  function startCreate() {
    setNewVariant({ phoneModelId: modelId, variantName: "", storage, ram, color });
    setCreateError(null);
    setCreating(true);
  }

  function submitCreate() {
    if (!create) return;
    if (!newVariant.phoneModelId) {
      setCreateError("Select a model.");
      return;
    }
    const formData = new FormData();
    Object.entries(newVariant).forEach(([key, val]) => formData.set(key, val));
    startTransition(async () => {
      const result = await create.action(formData);
      if (!result.ok) {
        setCreateError(result.error);
        return;
      }
      const model = create.models.find((entry) => entry.id === newVariant.phoneModelId);
      const [brand, ...rest] = (model?.label ?? "").split(" ");
      const option: VariantPickerOption = {
        id: result.id,
        phoneModelId: newVariant.phoneModelId,
        brand: brand ?? "",
        modelName: rest.join(" "),
        variantName: newVariant.variantName.trim() || buildVariantName({ storage: newVariant.storage || null, ram: newVariant.ram || null, color: newVariant.color || null }),
        color: newVariant.color || null,
        storage: newVariant.storage || null,
        ram: newVariant.ram || null,
      };
      setCreatedLabel({ id: result.id, label: variantDisplayLabel(option) });
      choose(option);
      router.refresh();
    });
  }

  // Create form: preview with the same cleanup the server applies, and surface existing
  // variants that match what's being typed so the user can pick one instead of duplicating.
  const draft = { storage: normalizeStorage(newVariant.storage), ram: normalizeRam(newVariant.ram), color: normalizeColor(newVariant.color) };
  const draftName = newVariant.variantName.trim() || buildVariantName(draft);
  const typedAny = Boolean(draft.storage || draft.ram || draft.color || newVariant.variantName.trim());
  const sameText = (a: string | null, b: string | null) => (a ?? "").toLowerCase() === (b ?? "").toLowerCase();
  const similar = creating
    ? variants
        .filter((variant) => !newVariant.phoneModelId || variant.phoneModelId === newVariant.phoneModelId)
        .map((variant) => {
          const colorTyped = (newVariant.color.trim()).toLowerCase();
          const colorHit = colorTyped ? (variant.color ?? "").toLowerCase().includes(colorTyped) || colorTyped.includes((variant.color ?? "~").toLowerCase()) : false;
          const storageHit = Boolean(draft.storage) && sameText(variant.storage, draft.storage);
          const ramHit = Boolean(draft.ram) && sameText(variant.ram, draft.ram);
          const nameHit = Boolean(newVariant.variantName.trim()) && variant.variantName.toLowerCase().includes(newVariant.variantName.trim().toLowerCase());
          const exact =
            variant.phoneModelId === newVariant.phoneModelId &&
            (sameText(variant.variantName, draftName) || (typedAny && sameText(variant.storage, draft.storage) && sameText(variant.ram, draft.ram) && sameText(variant.color, draft.color)));
          const score = (exact ? 10 : 0) + (colorHit ? 3 : 0) + (storageHit ? 2 : 0) + (ramHit ? 1 : 0) + (nameHit ? 2 : 0);
          return { variant, score, exact };
        })
        .filter((entry) => (typedAny ? entry.score > 0 : Boolean(newVariant.phoneModelId)))
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
    : [];
  const exactMatch = similar.find((entry) => entry.exact);

  const input = "w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

  return (
    <>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button type="button" onClick={() => setOpen(true)} className={`${input} flex items-center justify-between gap-2 text-left transition hover:border-slate-400 ${selectedLabel ? "text-slate-900" : "text-slate-400"}`}>
        <span className="truncate">{selectedLabel || placeholder}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-slate-400" />
      </button>
      {open ? (
        <Modal
          title={creating ? "Create new variant" : "Select variant"}
          subtitle={creating ? "Storage, RAM and color are optional — leave the name blank to build it from them" : `${results.length} of ${variants.length} variants`}
          icon={creating ? <Plus className="size-4" /> : <Smartphone className="size-4" />}
          size="lg"
          flush={!creating}
          busy={pending}
          onClose={() => {
            setOpen(false);
            reset();
          }}
          footer={
            creating && create ? (
              <>
                <button type="button" onClick={() => setCreating(false)} disabled={pending} className={modalButton.secondary}>
                  Back to list
                </button>
                <button type="button" disabled={pending} onClick={exactMatch ? () => choose(exactMatch.variant) : submitCreate} className={modalButton.primary}>
                  {pending ? "Creating..." : exactMatch ? "Use existing variant" : "Create & select"}
                </button>
              </>
            ) : search || modelId || storage || ram || color || inStockOnly ? (
              <button
                type="button"
                onClick={() => {
                  reset();
                  setInStockOnly(false);
                }}
                className={modalButton.secondary}
              >
                Clear filters
              </button>
            ) : undefined
          }
        >
          {creating && create ? (
            <div className="grid gap-3">
              <label className={modalField.label}>
                Model
                <SearchableSelect
                  placeholder="Select model"
                  value={newVariant.phoneModelId}
                  options={create.models.map((model) => ({ value: model.id, label: model.label }))}
                  onChange={(next) => setNewVariant((current) => ({ ...current, phoneModelId: next }))}
                  quickAdd={create.modelQuickAdd}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className={modalField.label}>
                  Storage
                  <input value={newVariant.storage} onChange={(event) => setNewVariant((current) => ({ ...current, storage: event.target.value }))} placeholder="e.g. 128GB" className={modalField.input} />
                </label>
                <label className={modalField.label}>
                  RAM
                  <input value={newVariant.ram} onChange={(event) => setNewVariant((current) => ({ ...current, ram: event.target.value }))} placeholder="e.g. 6GB" className={modalField.input} />
                </label>
                <label className={modalField.label}>
                  Color
                  <input value={newVariant.color} onChange={(event) => setNewVariant((current) => ({ ...current, color: event.target.value }))} placeholder="e.g. Midnight" className={modalField.input} />
                </label>
              </div>
              <label className={modalField.label}>
                Variant name (optional)
                <input
                  value={newVariant.variantName}
                  onChange={(event) => setNewVariant((current) => ({ ...current, variantName: event.target.value }))}
                  placeholder={buildVariantName({ storage: newVariant.storage || null, ram: newVariant.ram || null, color: newVariant.color || null })}
                  className={modalField.input}
                />
              </label>
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Will be saved as <span className="font-medium text-slate-900">{draftName}</span>
                {draft.storage || draft.ram || draft.color ? <SpecChips color={draft.color} storage={draft.storage} ram={draft.ram} className="ml-2 align-middle" /> : null}
              </p>
              {similar.length ? (
                <div className={`rounded-xl border p-3 ${exactMatch ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
                  <p className={`text-xs font-semibold ${exactMatch ? "text-amber-900" : "text-slate-700"}`}>
                    {exactMatch ? "⚠ This variant already exists — select it instead of creating a duplicate:" : typedAny ? "Similar variants already exist — select one if it's what you need:" : "Existing variants of this model:"}
                  </p>
                  <ul className="mt-2 grid gap-1.5">
                    {similar.map(({ variant, exact }) => (
                      <li key={variant.id}>
                        <button
                          type="button"
                          onClick={() => choose(variant)}
                          className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition hover:border-slate-400 hover:bg-slate-50 ${exact ? "border-amber-300 bg-white" : "border-slate-200"}`}
                        >
                          <span className="flex min-w-0 flex-col gap-1">
                            <span className="truncate font-medium text-slate-900">
                              {variant.variantName}
                              {!newVariant.phoneModelId ? <span className="ml-1.5 text-xs font-normal text-slate-500">{variant.brand} {variant.modelName}</span> : null}
                            </span>
                            <SpecChips color={variant.color} storage={variant.storage} ram={variant.ram} className="flex" />
                          </span>
                          <span className="shrink-0 rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white">{exact ? "Use this" : "Select"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {createError ? <p className="text-xs text-red-700">{createError}</p> : null}
            </div>
          ) : (
            <>
              <div className="sticky top-0 z-10 grid gap-2 border-b border-slate-100 bg-white px-5 py-3">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <input
                      data-autofocus
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && results.length) {
                          event.preventDefault();
                          choose(results[0]);
                        }
                      }}
                      placeholder="Type to search, e.g. 13 pro 256 blue"
                      className={`${modalField.input} pl-9`}
                    />
                  </div>
                  <select
                    value={modelId}
                    onChange={(event) => {
                      setModelId(event.target.value);
                      setStorage("");
                      setRam("");
                      setColor("");
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm sm:w-56"
                  >
                    <option value="">All models</option>
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Chips label="Storage" options={storageOptions} value={storage} onChange={(next) => { setStorage(next); setRam(""); setColor(""); }} />
                <Chips label="RAM" options={ramOptions} value={ram} onChange={(next) => { setRam(next); setColor(""); }} />
                <Chips label="Color" options={colorOptions} value={color} onChange={setColor} colors />
                {hasStock ? (
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" checked={inStockOnly} onChange={(event) => setInStockOnly(event.target.checked)} />
                    In stock only
                  </label>
                ) : null}
              </div>
              <div className="px-2 py-2">
                {Array.from(groups).map(([modelKey, list]) => (
                  <div key={modelKey} className="mb-2">
                    <p className="flex items-baseline justify-between gap-2 px-3 py-1.5 text-sm font-semibold text-slate-800">
                      <span className="truncate">
                        <span className="text-slate-500">{list[0].brand}</span> {list[0].modelName}
                      </span>
                      <span className="shrink-0 text-xs font-normal text-slate-400">{list.length} variant{list.length === 1 ? "" : "s"}</span>
                    </p>
                    {list.map((variant) => (
                      <button
                        key={variant.id}
                        type="button"
                        onClick={() => choose(variant)}
                        className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-slate-100 ${variant.id === value ? "bg-slate-100 ring-1 ring-slate-300" : ""}`}
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate font-medium text-slate-900">{variant.variantName}</span>
                            {search && results[0]?.id === variant.id ? <kbd className="shrink-0 rounded border border-slate-200 bg-slate-50 px-1 text-[10px] text-slate-500">Enter ↵</kbd> : null}
                          </span>
                          <SpecChips color={variant.color} storage={variant.storage} ram={variant.ram} className="flex" />
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {variant.inStock !== undefined ? (
                            <span className={`rounded-full px-2 py-0.5 text-xs ${variant.inStock ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{variant.inStock} in stock</span>
                          ) : null}
                          {variant.id === value ? <Check className="size-4 text-slate-700" /> : null}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
                {!results.length ? <p className="px-3 py-6 text-center text-sm text-slate-500">No variants match these filters.</p> : null}
                {create ? (
                  <button type="button" onClick={startCreate} className="mt-1 flex w-full items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-left text-sm font-medium text-slate-800 transition hover:border-slate-400 hover:bg-slate-50">
                    <Plus className="size-4" />
                    Create new variant{storage || ram || color ? ` (${[storage, ram && `${ram} RAM`, color].filter(Boolean).join(" · ")})` : ""}
                  </button>
                ) : null}
              </div>
            </>
          )}
        </Modal>
      ) : null}
    </>
  );
}

/** Uncontrolled wrapper for plain server-action forms: submits the chosen id under `name`. */
export function VariantPickerField(props: Omit<Props, "value" | "onChange"> & { name: string; defaultValue?: string }) {
  const [value, setValue] = useState(props.defaultValue ?? "");
  return <VariantPicker {...props} value={value} onChange={(variant) => setValue(variant.id)} />;
}
