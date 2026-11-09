"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { formatMoney } from "@/lib/currency";
import { CostRow } from "@/components/ui/cost-breakdown-modal";
import { ReauthFields } from "@/components/ui/reauth-fields";
import { useEditableRow, type ActionResult } from "@/components/ui/editable-row";

type PhoneRow = {
  id: string;
  imei: string;
  notes: string | null;
  phoneVariant: { variantName: string; specs?: string; phoneModel: { brand: string; modelName: string } };
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
  archiveAction: (formData: FormData) => void | Promise<void>;
};

export function PhoneCostEditor({ phone, showCost, canGrade, requireReauth, username, updateAction, archiveAction }: Props) {
  const { editing, error, pending, open, cancel, save } = useEditableRow(updateAction);
  // An IMEI change is held here until the user re-types the new number in the popup.
  const [pendingImeiChange, setPendingImeiChange] = useState<FormData | null>(null);
  const [imeiConfirmInput, setImeiConfirmInput] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
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
              <input name="imei" required defaultValue={phone.imei} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
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
            {requireReauth ? <ReauthFields username={username} /> : null}
            {error ? <p className="col-span-full text-xs text-red-700">{error}</p> : null}
            <div className="flex items-end gap-2">
              <button type="submit" disabled={pending} className="rounded-md bg-slate-900 px-3 py-1 text-xs text-white disabled:opacity-60">
                {pending ? "Saving..." : "Save"}
              </button>
              <button type="button" onClick={cancel} className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700">
                Cancel
              </button>
            </div>
          </form>
          {pendingImeiChange && typeof document !== "undefined"
            ? createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPendingImeiChange(null)}>
                  <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
                    <h3 className="text-base font-semibold text-slate-900">Confirm IMEI change</h3>
                    <p className="mt-2 text-sm text-slate-600">
                      <span className="font-mono">{phone.imei}</span> → <span className="font-mono font-semibold text-slate-900">{newImei}</span>
                    </p>
                    <p className="mt-2 text-sm text-slate-600">Re-type the new IMEI to confirm. This changes the unit&apos;s identity everywhere it appears.</p>
                    <input
                      autoFocus
                      value={imeiConfirmInput}
                      onChange={(event) => setImeiConfirmInput(event.target.value)}
                      placeholder="New IMEI"
                      className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm"
                    />
                    {imeiConfirmInput && imeiConfirmInput.trim() !== newImei ? <p className="mt-1 text-xs text-red-700">Doesn&apos;t match the new IMEI.</p> : null}
                    <div className="mt-4 flex justify-end gap-2">
                      <button type="button" onClick={() => setPendingImeiChange(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700">
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={imeiConfirmInput.trim() !== newImei}
                        onClick={confirmImeiChange}
                        className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
                      >
                        Confirm change
                      </button>
                    </div>
                  </div>
                </div>,
                document.body
              )
            : null}
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
      <td className="px-2 py-2">{phone.phoneVariant.phoneModel.brand} {phone.phoneVariant.phoneModel.modelName}</td>
      <td className="px-2 py-2">
        {phone.phoneVariant.variantName}
        {phone.phoneVariant.specs ? <p className="mt-0.5 text-xs text-slate-500">{phone.phoneVariant.specs}</p> : null}
      </td>
      <td className="px-2 py-2">{phone.grade || "Not Graded"}</td>
      <td className="px-2 py-2">{phone.batteryHealth !== null ? `${phone.batteryHealth}%` : "-"}</td>
      <td className="px-2 py-2">{phone.status}</td>
      {showCost ? <td className="px-2 py-2">{formatMoney(purchasePrice)}</td> : null}
      {showCost ? <td className="px-2 py-2">{formatMoney(tagCost)}</td> : null}
      {showCost ? <td className="px-2 py-2">{formatMoney(batteryCost)}</td> : null}
      <td className="px-2 py-2" onClick={(event) => event.stopPropagation()}>
        <div className="flex flex-wrap gap-2">
          {showCost ? (
            <button type="button" onClick={open} className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700">
              Edit
            </button>
          ) : null}
          <form action={archiveAction}>
            <input type="hidden" name="id" value={phone.id} />
            <button className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700">Archive</button>
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
