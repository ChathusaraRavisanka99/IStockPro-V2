import { ModulePlaceholder } from "@/components/ui/module-placeholder";

export default function ReturnsPage() {
  return (
    <ModulePlaceholder
      title="Returns"
      subtitle="Sale-linked returns with condition-based restock logic"
      todos={[
        "TODO: Select sale and sale items for return",
        "TODO: Create Return, ReturnItems, ReturnInvoice",
        "TODO: Restock or write-off based on condition",
      ]}
    />
  );
}
