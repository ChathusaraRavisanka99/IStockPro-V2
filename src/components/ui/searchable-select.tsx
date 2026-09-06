"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

type Option = { label: string; value: string };

export type QuickAddField = {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "select";
  required?: boolean;
  options?: Option[];
  /** For type "select" fields — lets the nested picker create a brand-new option
   * on the fly too (e.g. "create a model" from inside "create a variant"). */
  quickAdd?: QuickAdd;
};

export type QuickAdd = {
  label: string;
  action: (formData: FormData) => void | Promise<void>;
  fields: QuickAddField[];
};

type Props = {
  name?: string;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  options: Option[];
  required?: boolean;
  "aria-label"?: string;
  quickAdd?: QuickAdd;
  onChange?: (value: string) => void;
};

export function SearchableSelect({ name, value, defaultValue = "", placeholder = "Select", options, required, "aria-label": ariaLabel, quickAdd, onChange }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState(value ?? defaultValue);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addValues, setAddValues] = useState<Record<string, string>>({});
  const [addTouched, setAddTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === selected);
  const filtered = useMemo(() => options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase())), [options, query]);

  function reposition() {
    const trigger = wrapperRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = rect.width;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const preferredHeight = 420;
    if (spaceBelow >= 220 || spaceBelow >= spaceAbove) {
      setPopoverStyle({ top: rect.bottom + 4, left, width, maxHeight: Math.max(160, Math.min(preferredHeight, spaceBelow)) });
    } else {
      const maxHeight = Math.max(160, Math.min(preferredHeight, spaceAbove));
      setPopoverStyle({ top: Math.max(8, rect.top - 4 - maxHeight), left, width, maxHeight });
    }
  }

  function toggleOpen() {
    if (!open) reposition();
    setOpen((prev) => !prev);
  }

  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      // A quick-add field can itself be a SearchableSelect (e.g. "create a model"
      // nested inside "create a variant"). Each popover is its own portal appended
      // straight to document.body, so a nested one is a DOM *sibling* of this one,
      // not a descendant — popoverRef.contains() alone would miss it and close this
      // picker out from under the nested one. Any click inside *any* open
      // SearchableSelect popover (tagged below) counts as "inside" for all of them.
      if (target instanceof Element && target.closest("[data-searchable-popover]")) return;
      close();
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function selectOption(nextValue: string) {
    setSelected(nextValue);
    onChange?.(nextValue);
  }

  function close() {
    setOpen(false);
    setAdding(false);
    setQuery("");
  }

  function startAdding() {
    setAddValues({});
    setAddTouched(false);
    setAdding(true);
  }

  async function submitQuickAdd() {
    if (!quickAdd) return;
    const missingRequired = quickAdd.fields.some((field) => field.required && !addValues[field.name]?.trim());
    if (missingRequired) {
      setAddTouched(true);
      return;
    }
    setSubmitting(true);
    const formData = new FormData();
    quickAdd.fields.forEach((field) => formData.append(field.name, addValues[field.name] ?? ""));
    await quickAdd.action(formData);
    // The action is invoked directly here rather than via a real form submission, so
    // Next.js has no reason to refetch this route's data on its own even though the
    // server action's revalidatePath() marked it stale — without this, the newly
    // created option silently doesn't exist in `options` until a manual page reload.
    router.refresh();
    setSubmitting(false);
    setAddValues({});
    setAdding(false);
  }

  const popover = open && popoverStyle ? (
    <div
      ref={popoverRef}
      data-searchable-popover=""
      style={{ position: "fixed", top: popoverStyle.top, left: popoverStyle.left, width: popoverStyle.width, maxHeight: popoverStyle.maxHeight }}
      className="z-50 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
    >
      {!adding ? (
        <>
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type to search..." className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" />
          <div className="max-h-52 overflow-y-auto">
            {filtered.map((option) => <button type="button" key={option.value} onClick={() => { selectOption(option.value); close(); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-100">{option.label}</button>)}
            {!filtered.length ? <p className="px-3 py-2 text-sm text-slate-500">No matches</p> : null}
          </div>
          {quickAdd ? (
            <button type="button" onClick={startAdding} className="mt-2 block w-full rounded-lg border border-dashed border-slate-300 px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-100">
              + Add {quickAdd.label}
            </button>
          ) : null}
        </>
      ) : (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">Add {quickAdd?.label}</p>
            <button type="button" onClick={() => setAdding(false)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-700">Back</button>
          </div>
          <div className="grid gap-2">
            {quickAdd?.fields.map((field) => {
              const fieldValue = addValues[field.name] ?? "";
              const showError = addTouched && field.required && !fieldValue.trim();
              return (
                <label key={field.name} className="grid min-w-0 gap-1 text-sm font-medium text-slate-700">
                  {field.label}
                  {field.type === "select" ? (
                    <SearchableSelect
                      placeholder="Select"
                      options={field.options || []}
                      quickAdd={field.quickAdd}
                      onChange={(nextValue) => setAddValues((current) => ({ ...current, [field.name]: nextValue }))}
                    />
                  ) : (
                    <input
                      type={field.type || "text"}
                      value={fieldValue}
                      onChange={(event) => setAddValues((current) => ({ ...current, [field.name]: event.target.value }))}
                      placeholder={field.label}
                      className={`w-full min-w-0 rounded-lg border bg-white px-3 py-2 font-normal text-slate-900 ${showError ? "border-red-400" : "border-slate-300"}`}
                    />
                  )}
                </label>
              );
            })}
            {addTouched && quickAdd?.fields.some((field) => field.required && !addValues[field.name]?.trim()) ? (
              <p className="text-xs text-red-600">Please fill in the required fields.</p>
            ) : null}
            <button type="button" disabled={submitting} onClick={submitQuickAdd} className="mt-1 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60">
              {submitting ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div ref={wrapperRef} className="relative min-w-0 flex-1">
      {name ? <input type="hidden" name={name} value={selected} required={required} /> : null}
      <button type="button" aria-label={ariaLabel} onClick={toggleOpen} className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-900">
        <span className="truncate">{selectedOption?.label || placeholder}</span><span className="ml-2 shrink-0 text-slate-500">⌄</span>
      </button>
      {popover && typeof document !== "undefined" ? createPortal(popover, document.body) : null}
    </div>
  );
}
