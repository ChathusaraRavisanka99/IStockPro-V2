"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/components/ui/editable-row";

type Customer = { id: string; name: string; phone: string | null; email: string | null; address: string | null };

export function CustomerEditDialog({ customer, action, buttonClassName }: { customer: Customer; action: (formData: FormData) => Promise<ActionResult>; buttonClassName?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
    setError(null);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setError(null);
      router.refresh();
    });
  }

  const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClassName ?? "rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"}>
        Edit
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
              <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
                <h3 className="text-base font-semibold text-slate-900">Edit customer</h3>
                <form onSubmit={onSubmit} className="mt-4 grid gap-3">
                  <input type="hidden" name="id" value={customer.id} />
                  <label className="grid gap-1 text-xs text-slate-700">
                    Name
                    <input name="name" required defaultValue={customer.name} className={field} />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-700">
                    Phone
                    <input name="phone" defaultValue={customer.phone || ""} className={field} />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-700">
                    Email
                    <input name="email" type="email" defaultValue={customer.email || ""} className={field} />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-700">
                    Address
                    <input name="address" defaultValue={customer.address || ""} className={field} />
                  </label>
                  {error ? <p className="text-xs text-red-700">{error}</p> : null}
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={close} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700">
                      Cancel
                    </button>
                    <button type="submit" disabled={pending} className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-60">
                      {pending ? "Saving..." : "Save"}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
