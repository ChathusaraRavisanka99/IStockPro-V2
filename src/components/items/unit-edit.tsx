"use client";

import { createContext, useContext, useEffect, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Modal, modalButton, modalField } from "@/components/ui/modal";
import { VariantPicker, type CreateVariantResult, type VariantPickerOption } from "@/components/items/variant-picker";
import { ImeiConflictNotice, type ImeiOwner } from "@/components/items/imei-conflict-notice";
import type { ActionResult } from "@/components/ui/editable-row";

export type EditableUnit = {
  id: string;
  imei: string;
  phoneVariantId: string;
  lotStatus: "Collection" | "Shipped" | "Cleared";
  lotNumber: string;
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
  createVariant?: { action: (formData: FormData) => Promise<CreateVariantResult>; models: { id: string; label: string }[] };
};

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
      className={className ?? "inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 transition hover:bg-slate-50"}
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
  const canGrade = unit.lotStatus === "Cleared";
  const pricesChanged = Boolean(unit.prices && prices && (Object.keys(prices) as (keyof NonNullable<typeof prices>)[]).some((key) => Math.abs(prices[key] - unit.prices![key]) >= 0.005));
  const needsPassword = pricesChanged && unit.lotStatus !== "Collection";
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
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={pending} className={modalButton.secondary}>
            Cancel
          </button>
          <button type="submit" form={formId} disabled={pending || Boolean(imeiOwner)} className={modalButton.primary}>
            {pending ? "Saving..." : "Save changes"}
          </button>
        </>
      }
    >
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
            {needsPassword ? (
              <div className="grid gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 sm:grid-cols-2">
                <p className="text-xs text-amber-900 sm:col-span-2">Lot {unit.lotNumber} is past Collection, so changing prices needs your password.</p>
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

        {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      </form>
    </Modal>
  );
}
