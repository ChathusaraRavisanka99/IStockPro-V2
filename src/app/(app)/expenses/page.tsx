import { ModulePlaceholder } from "@/components/ui/module-placeholder";

export default function ExpensesPage() {
  return (
    <ModulePlaceholder
      title="Expenses"
      subtitle="Operating costs and receipts"
      todos={[
        "TODO: Expense CRUD with optional receipt upload",
        "TODO: Category filters and date range controls",
      ]}
    />
  );
}
