"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import type { ActionResult } from "@/components/ui/editable-row";
import { Modal, modalButton } from "@/components/ui/modal";

/** Button → confirm popup → server action; shows the action's error inline if refused. */
export function ConfirmActionButton({
  label,
  title,
  message,
  confirmLabel,
  fields,
  action,
  redirectTo,
  className,
  icon,
}: {
  label: ReactNode;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  fields: Record<string, string>;
  action: (formData: FormData) => Promise<ActionResult>;
  redirectTo?: string;
  className?: string;
  icon?: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setError(null);
  }

  function confirm() {
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) formData.set(key, value);
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
      <button type="button" onClick={() => setOpen(true)} className={className ?? "rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 transition hover:bg-red-50"}>
        {label}
      </button>
      {open ? (
        <Modal
          title={title}
          icon={icon ?? <Trash2 className="size-4" />}
          tone="danger"
          size="sm"
          busy={pending}
          onClose={close}
          footer={
            <>
              <button type="button" onClick={close} disabled={pending} className={modalButton.secondary}>
                Cancel
              </button>
              <button type="button" onClick={confirm} disabled={pending} data-autofocus className={modalButton.danger}>
                {pending ? "Working..." : confirmLabel}
              </button>
            </>
          }
        >
          <div className="text-sm text-slate-700">{message}</div>
          {error ? <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
        </Modal>
      ) : null}
    </>
  );
}
