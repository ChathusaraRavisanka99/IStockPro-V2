import { ModulePlaceholder } from "@/components/ui/module-placeholder";

export default function TaxPaymentsPage() {
  return (
    <ModulePlaceholder
      title="Tax Payments"
      subtitle="Tax liabilities and receipt tracking"
      todos={[
        "TODO: Tax payment CRUD",
        "TODO: Multiple receipt uploads per tax payment",
        "TODO: Include in P&L reporting totals",
      ]}
    />
  );
}
