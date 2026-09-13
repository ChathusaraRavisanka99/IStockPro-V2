"use client";

import { formatMoney } from "@/lib/currency";
import { FxAmountInput } from "@/components/ui/fx-amount-input";
import { ReauthFields } from "@/components/ui/reauth-fields";
import { useEditableRow, type ActionResult } from "@/components/ui/editable-row";

type Props = {
  title: string;
  fields: { name: string; label: string; defaultValue: number }[];
  requireReauth: boolean;
  username?: string;
  action: (formData: FormData) => Promise<ActionResult>;
};

/** A retroactive-correction section for one or more lot-level charge fields (shipping,
 * or tax/customs/other), collapsed to a read-only summary with an Edit toggle — no page
 * reload either way, and an inline re-auth reveal when the field belongs to a stage the
 * lot has already moved past. */
export function LotChargeEditor({ title, fields, requireReauth, username, action }: Props) {
  const { editing, error, pending, open, cancel, handleSubmit } = useEditableRow(action);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {!editing ? (
          <button type="button" onClick={open} className="text-xs text-slate-700 underline">
            Edit
          </button>
        ) : null}
      </div>
      {!editing ? (
        <div className="grid gap-1 text-sm text-slate-700 sm:grid-cols-3">
          {fields.map((field) => (
            <p key={field.name} className="flex justify-between gap-2 sm:block">
              <span className="text-slate-500">{field.label}</span> {formatMoney(field.defaultValue)}
            </p>
          ))}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map((field) => (
            <FxAmountInput key={field.name} name={field.name} label={field.label} defaultValue={field.defaultValue} />
          ))}
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
      )}
    </div>
  );
}
