import { ModulePlaceholder } from "@/components/ui/module-placeholder";

export default function CablesPage() {
  return (
    <ModulePlaceholder
      title="Items - Cables"
      subtitle="Quantity-based accessory inventory"
      todos={[
        "TODO: CRUD for Accessory category Cable",
        "TODO: Reorder alerts using lowStockThreshold",
        "TODO: Sales integration for decrement/increment flows",
      ]}
    />
  );
}
