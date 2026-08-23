import { ModulePlaceholder } from "@/components/ui/module-placeholder";

export default function SalesPage() {
  return (
    <ModulePlaceholder
      title="Sales"
      subtitle="New sales, invoicing, and split payments"
      todos={[
        "TODO: Cart flow for phone IMEI items and accessories",
        "TODO: Create Sale, SaleItems, and Invoice records",
        "TODO: Payment entries with optional proof upload",
        "TODO: Invoice PDF generation",
      ]}
    />
  );
}
