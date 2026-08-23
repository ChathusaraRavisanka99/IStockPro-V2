import { ModulePlaceholder } from "@/components/ui/module-placeholder";

export default function QuotationsPage() {
  return (
    <ModulePlaceholder
      title="Quotations"
      subtitle="Draft, export, and convert quotes to sales"
      todos={[
        "TODO: Quotation and quotation item CRUD",
        "TODO: Validity, tax percent, and handling fee controls",
        "TODO: Convert quotation to sale flow",
      ]}
    />
  );
}
