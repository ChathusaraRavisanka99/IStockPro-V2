"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import type { ActionResult } from "@/components/ui/editable-row";
import { Modal, modalButton, modalField } from "@/components/ui/modal";

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
  const formId = `confirm-${Object.values(fields).join("-")}`;

  function close() {
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
      close();
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClassName ?? "btn btn-xs btn-danger"}>
        {label}
      </button>
      {open ? (
        <Modal
          title={title}
          subtitle="Confirm it's you to continue"
          icon={<ShieldAlert className="size-5" />}
          tone="danger"
          size="sm"
          busy={pending}
          onClose={close}
          footer={
            <>
              <button type="button" onClick={close} disabled={pending} className={modalButton.secondary}>
                Cancel
              </button>
              <button type="submit" form={formId} disabled={pending} className={modalButton.danger}>
                {pending ? "Working..." : confirmLabel}
              </button>
            </>
          }
        >
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900">{message}</p>
          <form id={formId} onSubmit={onSubmit} className="mt-4 grid gap-3">
            {Object.entries(fields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <label className={modalField.label}>
              Username
              <input name="confirmUsername" required defaultValue={username} autoComplete="username" className={modalField.input} />
            </label>
            <label className={modalField.label}>
              Password
              <input name="confirmPassword" type="password" required data-autofocus autoComplete="current-password" className={modalField.input} />
            </label>
            {error ? <p className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs text-red-700">{error}</p> : null}
          </form>
        </Modal>
      ) : null}
    </>
  );
}
