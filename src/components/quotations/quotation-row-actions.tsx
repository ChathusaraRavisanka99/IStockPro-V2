import { EntityDeleteButton, EntityEditButton } from "@/components/ui/entity-editor";
import { deleteQuotationAction, updateQuotationAction } from "@/lib/quotation-actions";
import { formatMoney } from "@/lib/currency";

type QuotationLite = {
  id: string;
  quoteNumber: string;
  status: string;
  validUntil: Date | null;
  customerPhone: string | null;
  customerEmail: string | null;
  notes: string | null;
  totalAmount: unknown;
  itemCount: number;
  convertedSaleNumber?: string | null;
};

const STATUS_OPTIONS = ["Draft", "Sent", "Accepted", "Rejected"].map((value) => ({ value, label: value }));

/** Edit + Delete for a quotation (non-sensitive: nothing moves money or stock until converted). */
export function QuotationRowActions({ quotation, large, redirectAfterDelete }: { quotation: QuotationLite; large?: boolean; redirectAfterDelete?: string }) {
  const converted = quotation.status === "Converted";
  const editClass = large ? "inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50" : undefined;
  const deleteClass = large ? "inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1 text-sm text-red-700 hover:bg-red-50" : undefined;
  return (
    <>
      <EntityEditButton
        title={`Edit quotation ${quotation.quoteNumber}`}
        hidden={{ id: quotation.id }}
        action={updateQuotationAction}
        buttonClassName={editClass}
        note={converted ? "This quotation was converted to a sale, so only its notes can be changed." : "To change the line items or prices, create a new quotation — this keeps what the customer was quoted on record."}
        fields={
          converted
            ? [{ name: "notes", label: "Notes", value: quotation.notes ?? "", type: "textarea" }]
            : [
                { name: "status", label: "Status", value: quotation.status, type: "select", options: STATUS_OPTIONS },
                { name: "validUntil", label: "Valid until", value: quotation.validUntil?.toISOString().slice(0, 10) ?? "", type: "date" },
                { name: "customerPhone", label: "Customer phone (for this quote)", value: quotation.customerPhone ?? "", type: "tel" },
                { name: "customerEmail", label: "Customer email (for this quote)", value: quotation.customerEmail ?? "", type: "email" },
                { name: "notes", label: "Notes (printed on the quotation)", value: quotation.notes ?? "", type: "textarea" },
              ]
        }
      />
      <EntityDeleteButton
        title={`Delete quotation ${quotation.quoteNumber}?`}
        fields={{ id: quotation.id }}
        action={deleteQuotationAction}
        redirectTo={redirectAfterDelete}
        buttonClassName={deleteClass}
        blockedReason={converted ? `It was converted to sale ${quotation.convertedSaleNumber ?? ""} — the quotation is kept as the record of what was offered.`.replace("  ", " ") : null}
        consequences={[
          `The quotation and its ${quotation.itemCount} line item${quotation.itemCount === 1 ? "" : "s"} (${formatMoney(quotation.totalAmount)}) are removed.`,
          "Any PDF already sent to the customer stays with them, but it can't be reopened or converted here.",
          "No stock or money is affected. This is permanent and recorded in the activity log.",
        ]}
      />
    </>
  );
}
