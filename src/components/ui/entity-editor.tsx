"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Ban, Pencil, ShieldAlert, Trash2, ShieldCheck } from "lucide-react";
import { Modal, modalButton, modalField } from "@/components/ui/modal";
import { formatMoney } from "@/lib/currency";
import type { ActionResult } from "@/components/ui/editable-row";
import { SearchableSelect, type QuickAdd } from "@/components/ui/searchable-select";

export type EditorField = {
  name: string;
  label: string;
  value: string;
  type?: "text" | "number" | "date" | "textarea" | "select" | "searchable" | "email" | "tel";
  options?: { value: string; label: string }[];
  /** Changing this field requires the review + password step. */
  sensitive?: boolean;
  required?: boolean;
  placeholder?: string;
  /** Show values as money in the review table. */
  money?: boolean;
  /** Full-width in the form grid. */
  wide?: boolean;
  /** For type "searchable": "+ Add …" inline creation (return { value } to auto-select it). */
  quickAdd?: QuickAdd;
};

const display = (field: EditorField, value: string) => {
  if (value === "") return "—";
  if (field.money) return formatMoney(Number(value));
  if (field.type === "select" || field.type === "searchable") return field.options?.find((option) => option.value === value)?.label ?? value;
  return value;
};
const changed = (field: EditorField, next: string) => {
  if (field.type === "number") return Math.abs(Number(next || 0) - Number(field.value || 0)) >= 0.005;
  return next.trim() !== field.value.trim();
};

function PasswordFields({ username }: { username?: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={modalField.label}>
        Username
        <input name="confirmUsername" required defaultValue={username} autoComplete="username" className={modalField.input} />
      </label>
      <label className={modalField.label}>
        Password
        <input name="confirmPassword" type="password" required data-autofocus autoComplete="current-password" className={modalField.input} />
      </label>
    </div>
  );
}

/**
 * Edit button + popup for any record. Non-sensitive changes save directly; if a sensitive field
 * changed, a "Review changes" step shows every field's before → after and asks for the password.
 * (The server action re-checks this with requireReauthWhen — the client step is for clarity.)
 */
export function EntityEditButton({
  title,
  subtitle,
  fields,
  hidden = {},
  action,
  username,
  label = "Edit",
  buttonClassName,
  note,
}: {
  title: string;
  subtitle?: string;
  fields: EditorField[];
  hidden?: Record<string, string>;
  action: (formData: FormData) => Promise<ActionResult>;
  username?: string;
  label?: ReactNode;
  buttonClassName?: string;
  note?: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formId = `entity-edit-${title.replace(/\W+/g, "-")}-${Object.values(hidden).join("-")}`;

  const current = (field: EditorField) => values[field.name] ?? field.value;
  const changes = fields.filter((field) => changed(field, current(field)));
  const sensitiveChanges = changes.filter((field) => field.sensitive);

  function start() {
    setValues(Object.fromEntries(fields.map((field) => [field.name, field.value])));
    setStep("edit");
    setError(null);
    setOpen(true);
  }

  function submit(extra?: FormData) {
    const formData = extra ?? new FormData();
    for (const [key, value] of Object.entries(hidden)) formData.set(key, value);
    for (const field of fields) formData.set(field.name, current(field));
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  function onEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!changes.length) {
      setOpen(false);
      return;
    }
    if (sensitiveChanges.length) {
      setError(null);
      setStep("review");
      return;
    }
    submit();
  }

  function onReviewSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit(new FormData(event.currentTarget));
  }

  return (
    <>
      <button type="button" onClick={start} className={buttonClassName ?? "btn btn-xs btn-secondary"}>
        {label === "Edit" ? <Pencil className="size-3" /> : null}
        {label}
      </button>
      {open ? (
        <Modal
          title={step === "review" ? "Review changes" : title}
          subtitle={step === "review" ? `${title} — confirm before saving` : subtitle}
          icon={step === "review" ? <ShieldAlert className="size-4" /> : <Pencil className="size-4" />}
          tone={step === "review" ? "danger" : "default"}
          size="lg"
          busy={pending}
          onClose={() => setOpen(false)}
          footer={
            step === "review" ? (
              <>
                <button type="button" onClick={() => setStep("edit")} disabled={pending} className={modalButton.secondary}>
                  Back
                </button>
                <button type="submit" form={`${formId}-review`} disabled={pending} className={modalButton.danger}>
                  {pending ? "Saving..." : "Confirm & save"}
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => setOpen(false)} disabled={pending} className={modalButton.secondary}>
                  Cancel
                </button>
                <button type="submit" form={formId} disabled={pending} className={modalButton.primary}>
                  {pending ? "Saving..." : sensitiveChanges.length ? "Review changes" : "Save changes"}
                </button>
              </>
            )
          }
        >
          {step === "edit" ? (
            <form id={formId} onSubmit={onEditSubmit} className="grid gap-3 sm:grid-cols-2">
              {note ? <div className="text-sm text-slate-600 sm:col-span-2">{note}</div> : null}
              {fields.map((field) => (
                <label key={field.name} className={`${modalField.label} ${field.wide || field.type === "textarea" ? "sm:col-span-2" : ""}`}>
                  <span className="flex items-center gap-1.5">
                    {field.label}
                    {field.sensitive ? (
                      <span className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1.5 text-[10px] font-semibold uppercase text-amber-800 ring-1 ring-inset ring-amber-200" title="Changing this needs a review and your password">
                        <ShieldAlert className="size-3" /> sensitive
                      </span>
                    ) : null}
                  </span>
                  {field.type === "textarea" ? (
                    <textarea value={current(field)} onChange={(event) => setValues((v) => ({ ...v, [field.name]: event.target.value }))} rows={3} placeholder={field.placeholder} className={modalField.input} />
                  ) : field.type === "searchable" ? (
                    <SearchableSelect
                      value={current(field)}
                      options={field.options ?? []}
                      placeholder={field.placeholder ?? "Select"}
                      quickAdd={field.quickAdd}
                      onChange={(next) => setValues((v) => ({ ...v, [field.name]: next }))}
                    />
                  ) : field.type === "select" ? (
                    <select value={current(field)} onChange={(event) => setValues((v) => ({ ...v, [field.name]: event.target.value }))} required={field.required} className={modalField.input}>
                      {field.options?.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type ?? "text"}
                      step={field.type === "number" ? "0.01" : undefined}
                      min={field.type === "number" ? 0 : undefined}
                      value={current(field)}
                      onChange={(event) => setValues((v) => ({ ...v, [field.name]: event.target.value }))}
                      required={field.required}
                      placeholder={field.placeholder}
                      className={`${modalField.input} ${changed(field, current(field)) ? "border-sky-400 bg-sky-50/40" : ""}`}
                    />
                  )}
                </label>
              ))}
              {changes.length ? <p className="text-xs text-slate-500 sm:col-span-2">{changes.length} field{changes.length === 1 ? "" : "s"} changed{sensitiveChanges.length ? ` · ${sensitiveChanges.length} sensitive — you'll review them before saving` : ""}.</p> : null}
              {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 sm:col-span-2">{error}</p> : null}
            </form>
          ) : (
            <form id={`${formId}-review`} onSubmit={onReviewSubmit} className="grid gap-4">
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Field</th>
                      <th className="px-3 py-2">Before</th>
                      <th className="px-3 py-2" />
                      <th className="px-3 py-2">After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.map((field) => (
                      <tr key={field.name} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium text-slate-800">
                          {field.label}
                          {field.sensitive ? <ShieldAlert className="ml-1 inline size-3.5 text-amber-600" aria-label="sensitive" /> : null}
                        </td>
                        <td className="px-3 py-2 text-slate-500 line-through decoration-slate-300">{display(field, field.value)}</td>
                        <td className="px-1 py-2 text-slate-400"><ArrowRight className="size-3.5" /></td>
                        <td className="px-3 py-2 font-semibold text-slate-900">{display(field, current(field))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" /> These changes affect money or stock records, so they&apos;re logged and need your password.
              </p>
              <PasswordFields username={username} />
              {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
            </form>
          )}
        </Modal>
      ) : null}
    </>
  );
}

/**
 * Delete button + popup that spells out the consequences first. Sensitive records also need the
 * password; `blockedReason` disables deletion and explains why.
 */
export function EntityDeleteButton({
  title,
  consequences,
  kept,
  sensitive,
  blockedReason,
  fields,
  action,
  username,
  redirectTo,
  label = "Delete",
  confirmLabel = "Delete",
  buttonClassName,
}: {
  title: string;
  consequences: string[];
  /** Related records that are deliberately NOT deleted (shown as a second list). */
  kept?: string[];
  sensitive?: boolean;
  blockedReason?: string | null;
  fields: Record<string, string>;
  action: (formData: FormData) => Promise<ActionResult>;
  username?: string;
  redirectTo?: string;
  label?: ReactNode;
  confirmLabel?: string;
  buttonClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formId = `entity-delete-${Object.values(fields).join("-")}`;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    for (const [key, value] of Object.entries(fields)) formData.set(key, value);
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setError(null);
          setOpen(true);
        }}
        className={buttonClassName ?? "btn btn-xs btn-danger"}
      >
        {label === "Delete" ? <Trash2 className="size-3" /> : null}
        {label}
      </button>
      {open ? (
        <Modal
          title={title}
          subtitle={blockedReason ? "This can't be deleted right now" : sensitive ? "Review the consequences, then confirm with your password" : "Review the consequences before deleting"}
          icon={blockedReason ? <Ban className="size-4" /> : <Trash2 className="size-4" />}
          tone="danger"
          size="md"
          busy={pending}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button type="button" onClick={() => setOpen(false)} disabled={pending} className={modalButton.secondary}>
                {blockedReason ? "Close" : "Cancel"}
              </button>
              {!blockedReason ? (
                <button type="submit" form={formId} disabled={pending} data-autofocus={!sensitive || undefined} className={modalButton.danger}>
                  {pending ? "Deleting..." : confirmLabel}
                </button>
              ) : null}
            </>
          }
        >
          {blockedReason ? (
            <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
              <Ban className="mt-0.5 size-4 shrink-0" /> {blockedReason}
            </p>
          ) : (
            <form id={formId} onSubmit={onSubmit} className="grid gap-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">What will happen</p>
                <ul className="grid gap-1.5">
                  {consequences.map((line) => (
                    <li key={line} className="flex items-start gap-2 text-sm text-slate-700">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
              {kept?.length ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Kept — not deleted</p>
                  <ul className="grid gap-1.5">
                    {kept.map((line) => (
                      <li key={line} className="flex items-start gap-2 text-sm text-slate-700">
                        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {sensitive ? <PasswordFields username={username} /> : null}
              {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
            </form>
          )}
        </Modal>
      ) : null}
    </>
  );
}
