"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import type { ActionResult } from "@/components/ui/editable-row";
import { Modal, modalButton } from "@/components/ui/modal";

export function DeleteVariantButton({
  variantId,
  variantName,
  deleteAction,
  redirectTo,
  className,
}: {
  variantId: string;
  variantName: string;
  deleteAction: (formData: FormData) => Promise<ActionResult>;
  redirectTo?: string;
  className?: string;
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
    formData.set("id", variantId);
    startTransition(async () => {
      const result = await deleteAction(formData);
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
      <button type="button" onClick={() => setOpen(true)} className={className ?? "btn btn-xs btn-danger"}>
        Delete
      </button>
      {open ? (
        <Modal
          title={`Delete variant "${variantName}"?`}
          icon={<Trash2 className="size-4" />}
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
                {pending ? "Deleting..." : "Delete variant"}
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-700">It moves to the Recycle Bin for 30 days, then is permanently deleted. Sold units keep their history.</p>
          {error ? <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
        </Modal>
      ) : null}
    </>
  );
}
