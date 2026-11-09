"use client";

import { useState, useTransition, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/components/ui/editable-row";

type Props = {
  /** Text on the trigger button, e.g. "Delete". */
  label: string;
  title: string;
  /** Explains what will happen — shown above the password fields. */
  message: string;
  username?: string;
  /** Hidden fields submitted alongside confirmUsername/confirmPassword. */
  fields: Record<string, string>;
  action: (formData: FormData) => Promise<ActionResult>;
  confirmLabel?: string;
  /** Where to go after success; refreshes the current page when omitted. */
  redirectTo?: string;
  buttonClassName?: string;
};

/**
 * A destructive-action button that opens a "confirm it's you" popup. The owning server
 * action must verify confirmUsername/confirmPassword with checkReauth() (src/lib/reauth.ts).
 */
export function PasswordConfirmDialog({ label, title, message, username, fields, action, confirmLabel = "Delete", redirectTo, buttonClassName }: Props) {
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
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClassName ?? "rounded-md border border-red-200 px-2 py-1 text-xs text-red-700"}>
        {label}
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
              <div role="dialog" aria-modal="true" className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
                <h3 className="text-base font-semibold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm text-slate-600">{message}</p>
                <form onSubmit={onSubmit} className="mt-4 grid gap-3">
                  {Object.entries(fields).map(([name, value]) => (
                    <input key={name} type="hidden" name={name} value={value} />
                  ))}
                  <label className="grid gap-1 text-xs text-slate-700">
                    Username
                    <input name="confirmUsername" required defaultValue={username} autoComplete="username" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-700">
                    Password
                    <input name="confirmPassword" type="password" required autoFocus autoComplete="current-password" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                  </label>
                  {error ? <p className="text-xs text-red-700">{error}</p> : null}
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={close} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700">
                      Cancel
                    </button>
                    <button type="submit" disabled={pending} className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-60">
                      {pending ? "Working..." : confirmLabel}
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
