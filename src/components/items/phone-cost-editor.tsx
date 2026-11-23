"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ScanLine } from "lucide-react";
import { Modal, modalButton, modalField } from "@/components/ui/modal";
import { GradeBadge, PriceMissing, SpecChips, StatusPill } from "@/components/ui/spec-chips";
import { ImeiConflictNotice, type ImeiOwner } from "@/components/items/imei-conflict-notice";
import { UnitEditButton, type EditableUnit } from "@/components/items/unit-edit";
import { formatMoney } from "@/lib/currency";
import { CostRow } from "@/components/ui/cost-breakdown-modal";
import { ReauthFields } from "@/components/ui/reauth-fields";
import { useEditableRow, type ActionResult } from "@/components/ui/editable-row";
import { EntityLink } from "@/components/ui/entity-link";

type PhoneRow = {
  id: string;
  imei: string;
  notes: string | null;
  phoneVariant: { id?: string; phoneModelId?: string; variantName: string; specs?: string; color?: string | null; storage?: string | null; ram?: string | null; phoneModel: { brand: string; modelName: string } };
  grade: string | null;
  batteryHealth: number | null;
  status: string;
  purchasePrice: unknown;
  wholesalePrice: unknown;
  retailPrice: unknown;
  tagCost: unknown;
  batteryCost: unknown;
  lot?: { lotNumber: string } | null;
  expenses?: { category: string; description: string | null; amount: unknown; expenseDate: string | Date }[];
};

type Props = {
  phone: PhoneRow;
  showCost: boolean;
  canGrade: boolean;
  requireReauth: boolean;
  username?: string;
  updateAction: (formData: FormData) => Promise<ActionResult>;
  /** Looks up the live unit already holding an IMEI (excluding this one). */
  checkImei?: (imei: string, phoneId: string) => Promise<ImeiOwner | null>;
  /** When set (and a UnitEditProvider is above), Edit opens the full Edit-unit popup —
   * variant/model, IMEI, grade, notes, prices — instead of the inline cost form. */
  editUnit?: EditableUnit;
  archiveAction: (formData: FormData) => void | Promise<void>;
};

export function PhoneCostEditor({ phone, showCost, canGrade, requireReauth, username, updateAction, checkImei, editUnit, archiveAction }: Props) {
  const [imeiDraft, setImeiDraft] = useState(phone.imei);
  const [imeiOwner, setImeiOwner] = useState<ImeiOwner | null>(null);

  // Check the edited IMEI against other live units as the user types (debounced).
  useEffect(() => {
    const value = imeiDraft.trim();
    if (!checkImei || !value || value === phone.imei) {
      setImeiOwner(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const owner = await checkImei(value, phone.id);
      if (!cancelled) setImeiOwner(owner);
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [imeiDraft, checkImei, phone.id, phone.imei]);
  const { editing, error, pending, open, cancel, save } = useEditableRow(updateAction);
  // An IMEI change is held here until the user re-types the new number in the popup.
  const [pendingImeiChange, setPendingImeiChange] = useState<FormData | null>(null);
  const [imeiConfirmInput, setImeiConfirmInput] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (imeiOwner) return;
    const nextImei = String(formData.get("imei") || "").trim();
    if (nextImei && nextImei !== phone.imei) {
      setImeiConfirmInput("");
      setPendingImeiChange(formData);
      return;
    }
    save(formData);
  }

  function confirmImeiChange() {
    if (!pendingImeiChange) return;
    save(pendingImeiChange);
    setPendingImeiChange(null);
  }

  const newImei = pendingImeiChange ? String(pendingImeiChange.get("imei") || "").trim() : "";

  const purchasePrice = Number(phone.purchasePrice);
  const tagCost = Number(phone.tagCost);
  const batteryCost = Number(phone.batteryCost);
  const totalCost = purchasePrice + tagCost + batteryCost;
  const editRowRef = useRef<HTMLTableRowElement>(null);

  // This table lives in a horizontally-scrolling wrapper (more columns than fit on
  // mobile) — the "Edit" button sits in the last column, so on a phone the wrapper is
  // already scrolled right when it's clicked. Without this, the edit form's own fields
  // (leftmost columns) render off-screen and the user has to notice and swipe back.
  useEffect(() => {
    if (editing) editRowRef.current?.scrollIntoView({ inline: "start", block: "nearest" });
  }, [editing]);

  if (editing) {
    return (
      <tr ref={editRowRef} className="border-b border-slate-200 bg-slate-50">
        <td className="px-2 py-2" colSpan={showCost ? 9 : 7}>
          <form
            onSubmit={handleSubmit}
            className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6"
          >
            <input type="hidden" name="id" value={phone.id} />
            <p className="text-sm text-slate-700 sm:col-span-3 lg:col-span-6">
              {phone.imei} — {phone.phoneVariant.phoneModel.brand} {phone.phoneVariant.phoneModel.modelName} ({phone.phoneVariant.variantName})
            </p>
            <label className="grid min-w-0 gap-1 text-xs text-slate-600">
              IMEI
              <input
                name="imei"
                required
                value={imeiDraft}
                onChange={(event) => setImeiDraft(event.target.value)}
                aria-invalid={Boolean(imeiOwner)}
                className={`w-full min-w-0 rounded-lg border bg-white px-2 py-1 text-sm ${imeiOwner ? "border-red-400 ring-2 ring-red-100" : "border-slate-300"}`}
              />
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-slate-600">
              Purchase price
              <input name="purchasePrice" type="number" step="0.01" min={0} defaultValue={purchasePrice} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-slate-600">
              Wholesale price
              <input name="wholesalePrice" type="number" step="0.01" min={0} defaultValue={Number(phone.wholesalePrice ?? 0)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-slate-600">
              Retail price
              <input name="retailPrice" type="number" step="0.01" min={0} defaultValue={Number(phone.retailPrice ?? 0)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-slate-600">
              Tag cost
              <input name="tagCost" type="number" step="0.01" min={0} defaultValue={tagCost} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
            </label>
            <label className="grid min-w-0 gap-1 text-xs text-slate-600">
              Battery cost
              <input name="batteryCost" type="number" step="0.01" min={0} defaultValue={batteryCost} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
            </label>
            {canGrade ? (
              <>
                <label className="grid min-w-0 gap-1 text-xs text-slate-600">
                  Grade
                  <select name="grade" defaultValue={phone.grade || ""} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm">
                    <option value="">Not Graded</option>
                    <option value="A">Grade A</option>
                    <option value="B">Grade B</option>
                    <option value="C">Grade C</option>
                  </select>
                </label>
                <label className="grid min-w-0 gap-1 text-xs text-slate-600">
                  Battery health %
                  <input name="batteryHealth" type="number" min={0} max={100} defaultValue={phone.batteryHealth ?? ""} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
                </label>
              </>
            ) : null}
            {imeiOwner ? (
              <div className="col-span-full">
                <ImeiConflictNotice imei={imeiDraft.trim()} owner={imeiOwner} />
              </div>
            ) : null}
            {requireReauth ? <ReauthFields username={username} /> : null}
            {error ? <p className="col-span-full text-xs text-red-700">{error}</p> : null}
            <div className="flex items-end gap-2">
              <button type="submit" disabled={pending || Boolean(imeiOwner)} className="btn btn-xs btn-primary">
                {pending ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setImeiDraft(phone.imei);
                  cancel();
                }}
                className="btn btn-xs btn-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
          {pendingImeiChange ? (
            <Modal
              title="Confirm IMEI change"
              subtitle="This changes the unit's identity everywhere it appears"
              icon={<ScanLine className="size-4" />}
              size="sm"
              onClose={() => setPendingImeiChange(null)}
              footer={
                <>
                  <button type="button" onClick={() => setPendingImeiChange(null)} className={modalButton.secondary}>
                    Cancel
                  </button>
                  <button type="button" disabled={imeiConfirmInput.trim() !== newImei} onClick={confirmImeiChange} className={modalButton.primary}>
                    Confirm change
                  </button>
                </>
              }
            >
              <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
                <span className="text-xs text-slate-500">Current</span>
                <span className="font-mono text-slate-500 line-through">{phone.imei}</span>
                <span className="text-xs text-slate-500">New</span>
                <span className="font-mono font-semibold text-slate-900">{newImei}</span>
              </div>
              <label className={`${modalField.label} mt-4`}>
                Re-type the new IMEI to confirm
                <input
                  data-autofocus
                  value={imeiConfirmInput}
                  onChange={(event) => setImeiConfirmInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && imeiConfirmInput.trim() === newImei) confirmImeiChange();
                  }}
                  inputMode="numeric"
                  placeholder="New IMEI"
                  className={`${modalField.input} font-mono`}
                />
              </label>
              {imeiConfirmInput && imeiConfirmInput.trim() !== newImei ? <p className="mt-1.5 text-xs text-red-700">Doesn&apos;t match the new IMEI.</p> : null}
              {imeiConfirmInput.trim() === newImei ? <p className="mt-1.5 text-xs text-emerald-700">✓ Matches</p> : null}
            </Modal>
          ) : null}
        </td>
      </tr>
    );
  }

  const rowCells = (
    <>
      <td className="px-2 py-2">
        {phone.imei}
        {phone.notes ? <p className="mt-0.5 text-xs italic text-slate-500">{phone.notes}</p> : null}
      </td>
      <td className="px-2 py-2">
        {phone.phoneVariant.phoneModelId ? (
          <EntityLink kind="model" id={phone.phoneVariant.phoneModelId}>{phone.phoneVariant.phoneModel.brand} {phone.phoneVariant.phoneModel.modelName}</EntityLink>
        ) : (
          <>{phone.phoneVariant.phoneModel.brand} {phone.phoneVariant.phoneModel.modelName}</>
        )}
      </td>
      <td className="px-2 py-2">
        {phone.phoneVariant.id ? <EntityLink kind="variant" id={phone.phoneVariant.id}>{phone.phoneVariant.variantName}</EntityLink> : phone.phoneVariant.variantName}
        <SpecChips color={phone.phoneVariant.color} storage={phone.phoneVariant.storage} ram={phone.phoneVariant.ram} className="mt-1 flex" />
      </td>
      <td className="px-2 py-2"><GradeBadge grade={phone.grade} /></td>
      <td className="px-2 py-2">{phone.batteryHealth !== null ? `${phone.batteryHealth}%` : "-"}</td>
      <td className="px-2 py-2">
        <StatusPill status={phone.status} />
        {phone.status === "InStock" ? <PriceMissing retail={phone.retailPrice} wholesale={showCost ? phone.wholesalePrice : undefined} className="mt-1 flex" /> : null}
      </td>
      {showCost ? <td className="px-2 py-2">{formatMoney(purchasePrice)}</td> : null}
      {showCost ? <td className="px-2 py-2">{formatMoney(tagCost)}</td> : null}
      {showCost ? <td className="px-2 py-2">{formatMoney(batteryCost)}</td> : null}
      <td className="px-2 py-2" onClick={(event) => event.stopPropagation()}>
        <div className="flex flex-wrap gap-2">
          {editUnit ? (
            <UnitEditButton unit={editUnit} />
          ) : showCost ? (
            <button type="button" onClick={open} className="btn btn-xs btn-secondary">
              Edit
            </button>
          ) : null}
          <form action={archiveAction}>
            <input type="hidden" name="id" value={phone.id} />
            <button className="btn btn-xs btn-danger">Archive</button>
          </form>
        </div>
      </td>
    </>
  );

  // Cost/profit and expenses are sensitive figures — only wrap the row in the clickable
  // detail popup when the viewer is already allowed to see cost (showCost), matching the
  // gating already applied to this row's cost columns above. Otherwise render a plain row.
  if (!showCost) {
    return <tr className="border-b border-slate-200">{rowCells}</tr>;
  }

  return (
    <CostRow
      className="border-b border-slate-200"
      data={{
        name: `${phone.phoneVariant.phoneModel.brand} ${phone.phoneVariant.phoneModel.modelName} - ${phone.phoneVariant.variantName} - IMEI ${phone.imei}`,
        unitCost: purchasePrice,
        totalCost,
        wholesalePrice: Number(phone.wholesalePrice ?? 0),
        retailPrice: Number(phone.retailPrice ?? 0),
        costBreakdown: [
          { label: "Tag cost", amount: tagCost },
          { label: "Battery cost", amount: batteryCost },
        ],
        details: [
          { label: "Model", value: `${phone.phoneVariant.phoneModel.brand} ${phone.phoneVariant.phoneModel.modelName}` },
          { label: "Variant", value: phone.phoneVariant.variantName },
          ...(phone.phoneVariant.specs ? [{ label: "Specs", value: phone.phoneVariant.specs }] : []),
          { label: "IMEI", value: phone.imei },
          { label: "Status", value: phone.status },
          { label: "Grade", value: phone.grade || "Not Graded" },
          { label: "Battery health", value: phone.batteryHealth !== null ? `${phone.batteryHealth}%` : "-" },
          ...(phone.lot ? [{ label: "Lot", value: phone.lot.lotNumber }] : []),
          ...(phone.notes ? [{ label: "Notes", value: phone.notes }] : []),
        ],
        expenses: (phone.expenses ?? []).map((expense) => ({
          label: expense.category + (expense.description ? ` — ${expense.description}` : ""),
          amount: Number(expense.amount),
          date: new Date(expense.expenseDate).toISOString().slice(0, 10),
        })),
      }}
    >
      {rowCells}
    </CostRow>
  );
}
