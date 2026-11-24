"use client";

import { createContext, useContext, useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Pencil, Plus, Receipt } from "lucide-react";
import { formatMoney } from "@/lib/currency";
import type { UnitExpenseRow } from "@/lib/unit-expenses";
import { ItemComments } from "@/components/items/item-comments";
import { Modal, modalButton, modalField } from "@/components/ui/modal";
import { VariantPicker, type CreateVariantResult, type VariantPickerOption } from "@/components/items/variant-picker";
import { ImeiConflictNotice, type ImeiOwner } from "@/components/items/imei-conflict-notice";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { ActionResult } from "@/components/ui/editable-row";

export type EditableUnit = {
  id: string;
  imei: string;
  phoneVariantId: string;
  lotStatus: "Collection" | "Shipped" | "Cleared";
  lotNumber: string;
  lotId?: string;
  /** Phone status (InStock, Sold…) — moving a sold unit between lots is sensitive. */
  status?: string;
  grade: string | null;
  batteryHealth: number | null;
  notes: string | null;
  /** Present only for roles that can see cost. */
  prices?: { purchasePrice: number; wholesalePrice: number; retailPrice: number; tagCost: number; batteryCost: number };
};

type Shared = {
  variants: VariantPickerOption[];
  username?: string;
  action: (formData: FormData) => Promise<ActionResult>;
  checkImei: (imei: string, phoneId: string) => Promise<ImeiOwner | null>;
  /** Lots a unit can be moved to — only passed for roles that can see cost. */
  lots?: { id: string; label: string; status: string }[];
  createVariant?: { action: (formData: FormData) => Promise<CreateVariantResult>; models: { id: string; label: string }[] };
  /** Expense register inside the popup — only passed for roles that can see cost. */
  expenses?: {
    list: (phoneId: string) => Promise<UnitExpenseRow[]>;
    add: (formData: FormData) => Promise<{ ok: true; rows: UnitExpenseRow[] } | { ok: false; error: string }>;
    categories: string[];
  };
};

const PRICE_LABELS = { purchasePrice: "Purchase price", wholesalePrice: "Wholesale price", retailPrice: "Retail price", tagCost: "Tag cost", batteryCost: "Battery cost" } as const;

const UnitEditContext = createContext<{ open: (unit: EditableUnit) => void } | null>(null);

/**
 * Holds the shared data (variant list, actions) once per page and renders a single Edit-unit
 * popup; rows only render a lightweight <UnitEditButton>.
 */
export function UnitEditProvider({ children, ...shared }: Shared & { children: ReactNode }) {
  const [unit, setUnit] = useState<EditableUnit | null>(null);
  return (
    <UnitEditContext.Provider value={{ open: setUnit }}>
      {children}
      {unit ? <UnitEditDialog key={unit.id} unit={unit} shared={shared} onClose={() => setUnit(null)} /> : null}
    </UnitEditContext.Provider>
  );
}

export function UnitEditButton({ unit, className }: { unit: EditableUnit; className?: string }) {
  const context = useContext(UnitEditContext);
  if (!context) return null;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        context.open(unit);
      }}
      className={className ?? "btn btn-xs btn-secondary"}
    >
      <Pencil className="size-3" /> Edit
    </button>
  );
}

function UnitEditDialog({ unit, shared, onClose }: { unit: EditableUnit; shared: Shared; onClose: () => void }) {
  const router = useRouter();
  const [variantId, setVariantId] = useState(unit.phoneVariantId);
  const [imei, setImei] = useState(unit.imei);
  const [imeiOwner, setImeiOwner] = useState<ImeiOwner | null>(null);
  const [prices, setPrices] = useState(unit.prices);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formId = `unit-edit-${unit.id}`;
  // Expenses save on their own; refresh the page once when the popup closes instead of right
  // away, so a refresh never interrupts (or resets) edits still being typed here.
  const expensesChanged = useRef(false);
  const close = () => {
    onClose();
    if (expensesChanged.current) router.refresh();
  };
  const canGrade = unit.lotStatus === "Cleared";
  const pricesChanged = Boolean(unit.prices && prices && (Object.keys(prices) as (keyof NonNullable<typeof prices>)[]).some((key) => Math.abs(prices[key] - unit.prices![key]) >= 0.005));
  const [lotId, setLotId] = useState(unit.lotId ?? "");
  const lotChanged = Boolean(unit.lotId && lotId && lotId !== unit.lotId);
  const targetLot = shared.lots?.find((lot) => lot.id === lotId);
  const lotMoveSensitive = lotChanged && (unit.lotStatus !== "Collection" || targetLot?.status !== "Collection" || (unit.status ?? "InStock") !== "InStock");
  const pricePassword = pricesChanged && unit.lotStatus !== "Collection";
  const variantChanged = variantId !== unit.phoneVariantId;
  const fromVariant = shared.variants.find((variant) => variant.id === unit.phoneVariantId);
  const toVariant = shared.variants.find((variant) => variant.id === variantId);

  useEffect(() => {
    const value = imei.trim();
    if (!value || value === unit.imei) {
      setImeiOwner(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const owner = await shared.checkImei(value, unit.id);
      if (!cancelled) setImeiOwner(owner);
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [imei, unit.imei, unit.id, shared]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (imeiOwner) return;
    const formData = new FormData(event.currentTarget);
    formData.set("phoneVariantId", variantId);
    if (lotChanged) formData.set("lotId", lotId);
    startTransition(async () => {
      const result = await shared.action(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  const priceField = (key: keyof NonNullable<typeof prices>, label: string) => (
    <label className={modalField.label}>
      {label}
      <input
        name={key}
        type="number"
        step="0.01"
        min={0}
        value={prices?.[key] ?? 0}
        onChange={(event) => setPrices((current) => (current ? { ...current, [key]: Number(event.target.value) } : current))}
        className={modalField.input}
      />
    </label>
  );

  return (
    <Modal
      title="Edit unit"
      subtitle={`IMEI ${unit.imei} · lot ${unit.lotNumber}`}
      icon={<Pencil className="size-4" />}
      size="lg"
      busy={pending}
      onClose={close}
      footer={
        <>
          <button type="button" onClick={close} disabled={pending} className={modalButton.secondary}>
            Cancel
          </button>
          <button type="submit" form={formId} disabled={pending || Boolean(imeiOwner)} className={modalButton.primary}>
            {pending ? "Saving..." : "Save changes"}
          </button>
        </>
      }
    >
      <>
      <form id={formId} onSubmit={onSubmit} className="grid gap-4">
        <input type="hidden" name="id" value={unit.id} />

        <section className="grid gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone &amp; variant</p>
          <VariantPicker variants={shared.variants} value={variantId} onChange={(variant) => setVariantId(variant.id)} create={shared.createVariant} />
          {variantChanged && toVariant ? (
            <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">
              Moving from <b>{fromVariant ? `${fromVariant.brand} ${fromVariant.modelName} — ${fromVariant.variantName}` : "its current variant"}</b> to{" "}
              <b>
                {toVariant.brand} {toVariant.modelName} — {toVariant.variantName}
              </b>
              . The unit keeps its IMEI, lot, prices and history.
            </p>
          ) : (
            <p className="text-xs text-slate-500">Pick another variant — of this or any other model — to re-categorise the phone.</p>
          )}
        </section>

        {shared.lots && unit.lotId ? (
          <section className="grid gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lot</p>
            <SearchableSelect
              value={lotId}
              placeholder="Choose a lot"
              options={shared.lots.map((lot) => ({ value: lot.id, label: `${lot.label} · ${lot.status}` }))}
              onChange={(next) => setLotId(next || unit.lotId || "")}
            />
            {lotChanged && targetLot ? (
              <div className={`rounded-lg px-3 py-2 text-xs ${lotMoveSensitive ? "border border-amber-300 bg-amber-50 text-amber-900" : "bg-sky-50 text-sky-900"}`}>
                Moving from lot <b>{unit.lotNumber}</b> ({unit.lotStatus}) to lot <b>{targetLot.label}</b> ({targetLot.status}):
                <ul className="mt-1 list-disc pl-4">
                  <li>its purchase price moves from lot {unit.lotNumber}&apos;s goods cost to lot {targetLot.label}&apos;s — what you owe each supplier and both payment statuses are recalculated;</li>
                  <li>its share of shipping/tax/customs now comes from lot {targetLot.label}, so its landed cost and profit change;</li>
                  <li>the unit keeps its IMEI, variant, prices, sale history and expenses.</li>
                </ul>
                {lotMoveSensitive ? <p className="mt-1 font-medium">Sensitive change: a lot is past Collection or the unit is already sold — confirm with your password below.</p> : null}
              </div>
            ) : (
              <p className="text-xs text-slate-500">Registered to the wrong lot? Pick the right one to move it.</p>
            )}
          </section>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2">
          <label className={`${modalField.label} sm:col-span-2`}>
            IMEI
            <input name="imei" required value={imei} onChange={(event) => setImei(event.target.value)} aria-invalid={Boolean(imeiOwner)} className={`${modalField.input} font-mono ${imeiOwner ? "border-red-400 ring-2 ring-red-100" : ""}`} />
          </label>
          {imeiOwner ? (
            <div className="sm:col-span-2">
              <ImeiConflictNotice imei={imei.trim()} owner={imeiOwner} />
            </div>
          ) : null}
          {canGrade ? (
            <>
              <label className={modalField.label}>
                Grade
                <select name="grade" defaultValue={unit.grade ?? ""} className={modalField.input}>
                  <option value="">Not graded</option>
                  <option value="A">Grade A</option>
                  <option value="B">Grade B</option>
                  <option value="C">Grade C</option>
                </select>
              </label>
              <label className={modalField.label}>
                Battery health %
                <input name="batteryHealth" type="number" min={0} max={100} defaultValue={unit.batteryHealth ?? ""} className={modalField.input} />
              </label>
            </>
          ) : (
            <p className="text-xs text-slate-500 sm:col-span-2">Grade and battery health can be set once lot {unit.lotNumber} is Cleared.</p>
          )}
          <label className={`${modalField.label} sm:col-span-2`}>
            Notes
            <input name="notes" defaultValue={unit.notes ?? ""} placeholder="Shown to staff when selecting this unit in a sale" className={modalField.input} />
          </label>
        </section>

        {prices ? (
          <section className="grid gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Prices &amp; costs</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {priceField("purchasePrice", "Purchase price")}
              {priceField("wholesalePrice", "Wholesale price")}
              {priceField("retailPrice", "Retail price")}
              {priceField("tagCost", "Tag cost")}
              {priceField("batteryCost", "Battery cost")}
            </div>
            {pricePassword ? (
              <div className="grid gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 sm:grid-cols-2">
                <p className="text-xs text-amber-900 sm:col-span-2">Lot {unit.lotNumber} is past Collection, so these price changes need your password:</p>
                <ul className="grid gap-1 rounded-md bg-white/80 px-3 py-2 text-xs sm:col-span-2">
                  {unit.prices && prices
                    ? (Object.keys(prices) as (keyof NonNullable<typeof prices>)[])
                        .filter((key) => Math.abs(prices[key] - unit.prices![key]) >= 0.005)
                        .map((key) => (
                          <li key={key} className="flex flex-wrap items-center gap-2">
                            <span className="w-28 font-medium text-slate-700">{PRICE_LABELS[key]}</span>
                            <span className="text-slate-400 line-through">{formatMoney(unit.prices![key])}</span>
                            <span className="text-slate-400">→</span>
                            <span className="font-semibold text-slate-900">{formatMoney(prices[key])}</span>
                          </li>
                        ))
                    : null}
                </ul>
                <label className={modalField.label}>
                  Username
                  <input name="confirmUsername" required defaultValue={shared.username} className={modalField.input} />
                </label>
                <label className={modalField.label}>
                  Password
                  <input name="confirmPassword" type="password" required className={modalField.input} />
                </label>
              </div>
            ) : null}
          </section>
        ) : null}

        {lotMoveSensitive && !(prices && pricePassword) ? (
          <div className="grid gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 sm:grid-cols-2">
            <p className="text-xs text-amber-900 sm:col-span-2">Confirm the lot move with your password:</p>
            <label className={modalField.label}>
              Username
              <input name="confirmUsername" required defaultValue={shared.username} className={modalField.input} />
            </label>
            <label className={modalField.label}>
              Password
              <input name="confirmPassword" type="password" required className={modalField.input} />
            </label>
          </div>
        ) : null}

        {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      </form>
      {shared.expenses ? <UnitExpenses phoneId={unit.id} api={shared.expenses} onChanged={() => (expensesChanged.current = true)} /> : null}
      <ItemComments entityType="Phone" entityId={unit.id} />
      </>
    </Modal>
  );
}

/**
 * Expenses linked to this unit (repairs, parts…) with an inline "Add expense" form. Kept outside
 * the edit <form> and saved on its own, so adding an expense never submits the unit edit.
 */
function UnitExpenses({ phoneId, api, onChanged }: { phoneId: string; api: NonNullable<Shared["expenses"]>; onChanged: () => void }) {
  const [rows, setRows] = useState<UnitExpenseRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Load once per opened unit. The api object is recreated on every parent render (e.g. after
  // router.refresh), so it lives in a ref rather than the effect deps.
  const apiRef = useRef(api);
  apiRef.current = api;
  useEffect(() => {
    let cancelled = false;
    apiRef.current.list(phoneId).then((list) => {
      if (!cancelled) setRows(list);
    });
    return () => {
      cancelled = true;
    };
  }, [phoneId]);

  const total = (rows ?? []).reduce((sum, row) => sum + row.amount, 0);

  function save() {
    const formData = new FormData();
    formData.set("phoneId", phoneId);
    formData.set("category", category);
    formData.set("amount", amount);
    formData.set("expenseDate", date);
    formData.set("description", description);
    if (file) formData.set("receiptFile", file);
    startTransition(async () => {
      const result = await apiRef.current.add(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRows(result.rows);
      setError(null);
      setAdding(false);
      setCategory("");
      setAmount("");
      setDescription("");
      setFile(null);
      onChanged();
    });
  }

  return (
    <section className="mt-5 grid gap-3 border-t border-slate-100 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Receipt className="size-3.5" /> Expenses on this unit
          {rows?.length ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium normal-case text-slate-700">{formatMoney(total)}</span> : null}
        </p>
        {!adding ? (
          <button type="button" onClick={() => setAdding(true)} className="btn btn-xs btn-secondary">
            <Plus className="size-3.5" /> Add expense
          </button>
        ) : null}
      </div>

      {rows === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : rows.length ? (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {rows.map((row) => (
            <li key={row.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="font-medium text-slate-900">{row.category}</span>
                {row.hasReceipt ? <Paperclip className="ml-1 inline size-3.5 text-slate-400" aria-label="Has receipt" /> : null}
                <span className="block text-xs text-slate-500">
                  {row.date}
                  {row.description ? ` · ${row.description}` : ""}
                </span>
              </span>
              <span className="shrink-0 font-medium text-slate-900">{formatMoney(row.amount)}</span>
            </li>
          ))}
        </ul>
      ) : !adding ? (
        <p className="text-sm text-slate-500">No expenses recorded for this unit yet. Repairs, parts and similar costs added here show in its cost breakdown and on the Expenses page.</p>
      ) : null}

      {adding ? (
        <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-2">
          <label className={modalField.label}>
            Category
            <input list={`expense-categories-${phoneId}`} value={category} onChange={(event) => setCategory(event.target.value)} placeholder="e.g. Screen replacement" className={modalField.input} />
            <datalist id={`expense-categories-${phoneId}`}>
              {api.categories.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>
          <label className={modalField.label}>
            Amount (LKR)
            <input type="number" min={0} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className={modalField.input} />
          </label>
          <label className={modalField.label}>
            Date
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={modalField.input} />
          </label>
          <label className={modalField.label}>
            Receipt (optional)
            <input type="file" accept="image/*,application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-slate-200 file:px-2 file:py-1 file:text-xs" />
          </label>
          <label className={`${modalField.label} sm:col-span-2`}>
            Description (optional)
            <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What was done, who did it…" className={modalField.input} />
          </label>
          {error ? <p className="text-xs text-red-700 sm:col-span-2">{error}</p> : null}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={() => { setAdding(false); setError(null); }} disabled={pending} className={modalButton.secondary}>
              Cancel
            </button>
            <button type="button" onClick={save} disabled={pending} className={modalButton.primary}>
              {pending ? "Saving..." : "Save expense"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
