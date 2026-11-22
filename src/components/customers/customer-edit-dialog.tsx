"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import type { ActionResult } from "@/components/ui/editable-row";
import { Modal, modalButton, modalField } from "@/components/ui/modal";

type Customer = { id: string; name: string; phone: string | null; email: string | null; address: string | null };

export function CustomerEditDialog({ customer, action, buttonClassName }: { customer: Customer; action: (formData: FormData) => Promise<ActionResult>; buttonClassName?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formId = `customer-edit-${customer.id}`;

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
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClassName ?? "btn btn-xs btn-secondary"}>
        Edit
      </button>
      {open ? (
        <Modal
          title="Edit customer"
          subtitle={customer.name}
          icon={<UserRound className="size-4" />}
          busy={pending}
          onClose={close}
          footer={
            <>
              <button type="button" onClick={close} disabled={pending} className={modalButton.secondary}>
                Cancel
              </button>
              <button type="submit" form={formId} disabled={pending} className={modalButton.primary}>
                {pending ? "Saving..." : "Save changes"}
              </button>
            </>
          }
        >
          <form id={formId} onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={customer.id} />
            <label className={`${modalField.label} sm:col-span-2`}>
              Name
              <input name="name" required data-autofocus defaultValue={customer.name} className={modalField.input} />
            </label>
            <label className={modalField.label}>
              Phone
              <input name="phone" type="tel" defaultValue={customer.phone || ""} className={modalField.input} />
            </label>
            <label className={modalField.label}>
              Email
              <input name="email" type="email" defaultValue={customer.email || ""} className={modalField.input} />
            </label>
            <label className={`${modalField.label} sm:col-span-2`}>
              Address
              <textarea name="address" rows={2} defaultValue={customer.address || ""} className={modalField.input} />
            </label>
            {error ? <p className="text-xs text-red-700 sm:col-span-2">{error}</p> : null}
          </form>
        </Modal>
      ) : null}
    </>
  );
}
