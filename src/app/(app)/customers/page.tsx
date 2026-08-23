import { ModulePlaceholder } from "@/components/ui/module-placeholder";

export default function CustomersPage() {
  return (
    <ModulePlaceholder
      title="Customers"
      subtitle="Customer lifecycle and purchase history"
      todos={[
        "TODO: Customer CRUD",
        "TODO: Purchase history from linked sales",
        "TODO: Lifetime value metrics",
      ]}
    />
  );
}
