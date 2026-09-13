"use client";

import { formatMoney } from "@/lib/currency";
import { CostRow } from "@/components/ui/cost-breakdown-modal";
import { ReauthFields } from "@/components/ui/reauth-fields";
import { useEditableRow, type ActionResult } from "@/components/ui/editable-row";

type PhoneRow = {
  id: string;
  imei: string;
  notes: string | null;
  phoneVariant: { variantName: string; phoneModel: { brand: string; modelName: string } };
  grade: string | null;
  batteryHealth: number | null;
  status: string;
  purchasePrice: unknown;
  wholesalePrice: unknown;
  retailPrice: unknown;
  tagCost: unknown;
  batteryCost: unknown;
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
  const { editing, error, pending, open, cancel, handleSubmit } = useEditableRow(updateAction);

  const purchasePrice = Number(phone.purchasePrice);
  const tagCost = Number(phone.tagCost);
  const batteryCost = Number(phone.batteryCost);
  const totalCost = purchasePrice + tagCost + batteryCost;

  if (editing) {
    return (
      <tr className="border-b border-slate-200 bg-slate-50">
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
        </td>
      </tr>
    );
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
      }}
    >
      <td className="px-2 py-2">
        {phone.imei}
        {phone.notes ? <p className="mt-0.5 text-xs italic text-slate-500">{phone.notes}</p> : null}
      </td>
      <td className="px-2 py-2">{phone.phoneVariant.phoneModel.brand} {phone.phoneVariant.phoneModel.modelName}</td>
      <td className="px-2 py-2">{phone.phoneVariant.variantName}</td>
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
    </CostRow>
  );
}
