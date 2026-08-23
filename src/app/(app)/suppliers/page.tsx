import { ModulePlaceholder } from "@/components/ui/module-placeholder";

export default function SuppliersPage() {
  return (
    <ModulePlaceholder
      title="Suppliers"
      subtitle="Supplier records linked to lots"
      todos={[
        "TODO: Supplier CRUD",
        "TODO: Supplier analytics by lots and spend",
      ]}
    />
  );
}
