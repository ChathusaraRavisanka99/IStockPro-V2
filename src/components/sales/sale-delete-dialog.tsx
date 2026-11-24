"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { AlertTriangle, Ban, PackageCheck, PackageX, Trash2 } from "lucide-react";
import { Modal, modalButton } from "@/components/ui/modal";
import { PasswordFields } from "@/components/ui/entity-editor";
import { formatMoney } from "@/lib/currency";
import type { ActionResult } from "@/components/ui/editable-row";
import type { LineChoice, SaleDeleteLine } from "@/lib/sale-delete";

/**
 * "Delete sale": lists the consequences, lets you choose per item whether it goes back into
 * stock or is removed from inventory, then confirms with your password.
 */
export function SaleDeleteDialog({
  saleId,
  saleNumber,
  lines,
  consequences,
  blocked,
  username,
  action,
  autoOpen,
  redirectTo = "/sales",
}: {
  saleId: string;
  saleNumber: string;
  lines: SaleDeleteLine[];
  consequences: string[];
  blocked: string | null;
  username?: string;
  action: (formData: FormData) => Promise<ActionResult>;
  autoOpen?: boolean;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<Record<string, LineChoice>>(() => Object.fromEntries(lines.map((line) => [line.id, "restock" as LineChoice])));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  const setAll = (choice: LineChoice) => setChoices(Object.fromEntries(lines.map((line) => [line.id, choice])));
  const restockCount = lines.filter((line) => line.kind !== "other" && choices[line.id] === "restock").length;
  const removeCount = lines.filter((line) => line.kind !== "other" && choices[line.id] === "remove").length;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("id", saleId);
    formData.set("choices", JSON.stringify(choices));
    startTransition(async () => {
      const result = await action(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Sale ${saleNumber} deleted`);
      setOpen(false);
      router.push(redirectTo);
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-md btn-danger">
        <Trash2 className="size-4" /> Delete sale
      </button>
      {open ? (
        <Modal
          title={`Delete sale ${saleNumber}?`}
          subtitle={blocked ? "This can't be deleted right now" : "Choose what happens to each item, then confirm with your password"}
          icon={blocked ? <Ban className="size-4" /> : <Trash2 className="size-4" />}
          tone="danger"
          size="lg"
          busy={pending}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button type="button" onClick={() => setOpen(false)} disabled={pending} className={modalButton.secondary}>
                {blocked ? "Close" : "Cancel"}
              </button>
              {!blocked ? (
                <button type="submit" form={`sale-delete-${saleId}`} disabled={pending} className={modalButton.danger}>
                  {pending ? "Deleting…" : "Delete sale"}
                </button>
              ) : null}
            </>
          }
        >
          {blocked ? (
            <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
              <Ban className="mt-0.5 size-4 shrink-0" /> {blocked}
            </p>
          ) : (
            <form id={`sale-delete-${saleId}`} onSubmit={onSubmit} className="grid gap-4 text-sm">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">What will happen</p>
                <ul className="grid gap-1.5">
                  {consequences.map((line) => (
                    <li key={line} className="flex items-start gap-2 text-slate-700">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Items ({lines.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" className="btn btn-xs btn-secondary" onClick={() => setAll("restock")}>Restock all</button>
                    <button type="button" className="btn btn-xs btn-secondary" onClick={() => setAll("remove")}>Remove all</button>
                  </div>
                </div>
                <ul className="grid gap-1.5">
                  {lines.map((line) => (
                    <li key={line.id} className="rounded-lg border border-slate-200 px-3 py-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-slate-900">{line.label}</span>
                          <span className="text-xs text-slate-500">
                            {line.quantity > 1 ? `${line.quantity} units · ` : ""}
                            {formatMoney(line.amount)}
                          </span>
                          {line.note ? <span className="block text-xs text-amber-800">{line.note}</span> : null}
                        </span>
                        {line.kind !== "other" ? (
                          <div role="radiogroup" aria-label={`What happens to ${line.label}`} className="flex shrink-0 rounded-lg border border-slate-300 bg-white p-0.5 text-xs">
                            {(["restock", "remove"] as LineChoice[]).map((choice) => {
                              const active = choices[line.id] === choice;
                              return (
                                <button
                                  key={choice}
                                  type="button"
                                  role="radio"
                                  aria-checked={active}
                                  onClick={() => setChoices((current) => ({ ...current, [line.id]: choice }))}
                                  className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium ${active ? (choice === "restock" ? "bg-emerald-600 text-white" : "bg-red-600 text-white") : "text-slate-600 hover:bg-slate-100"}`}
                                >
                                  {choice === "restock" ? <PackageCheck className="size-3.5" /> : <PackageX className="size-3.5" />}
                                  {choice === "restock" ? "Restock" : "Remove"}
                                </button>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                      {line.kind !== "other" ? (
                        <p className="mt-1 text-xs text-slate-500">
                          {choices[line.id] === "restock"
                            ? line.kind === "phone"
                              ? "Goes back to In stock and can be sold again."
                              : `${line.quantity} unit(s) go back into stock.`
                            : line.kind === "phone"
                              ? "Leaves inventory — kept in the Recycle Bin for 30 days (restoring puts it back in stock)."
                              : `${line.quantity} unit(s) are not put back (treated as gone).`}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-slate-600">
                  {restockCount} line(s) restocked · {removeCount} line(s) removed from inventory
                </p>
              </div>

              <PasswordFields username={username} />
              {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">{error}</p> : null}
            </form>
          )}
        </Modal>
      ) : null}
    </>
  );
}
