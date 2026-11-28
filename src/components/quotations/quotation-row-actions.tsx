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
export function QuotationRowActions({ quotation, large, redirectAfterDelete, canDeleteConverted, username }: { quotation: QuotationLite; large?: boolean; redirectAfterDelete?: string; canDeleteConverted?: boolean; username?: string }) {
  const converted = quotation.status === "Converted";
  const editClass = large ? "btn btn-sm btn-secondary" : undefined;
  const deleteClass = large ? "btn btn-sm btn-danger" : undefined;
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
        sensitive={converted}
        username={username}
        blockedReason={converted && !canDeleteConverted ? `It was converted to sale ${quotation.convertedSaleNumber ?? ""} — only an admin or manager can delete it.`.replace("  ", " ") : null}
        consequences={[
          `The quotation and its ${quotation.itemCount} line item${quotation.itemCount === 1 ? "" : "s"} (${formatMoney(quotation.totalAmount)}) are removed.`,
          ...(converted
            ? [`Sale ${quotation.convertedSaleNumber ?? ""} stays exactly as it is — it just no longer links back to this quotation.`.replace("  ", " ")]
            : []),
          "Any PDF already sent to the customer stays with them, but it can't be reopened or converted here.",
          "No stock or money is affected. This is permanent; a full copy of the quotation is kept in the activity log.",
        ]}
      />
    </>
  );
}
