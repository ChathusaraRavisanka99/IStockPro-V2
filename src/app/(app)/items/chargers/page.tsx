import { ModulePlaceholder } from "@/components/ui/module-placeholder";

export default function ChargersPage() {
  return (
    <ModulePlaceholder
      title="Items - Chargers"
      subtitle="Quantity-based accessory inventory"
      todos={[
        "TODO: CRUD for Accessory category Charger",
        "TODO: Track quantity, sold quantity, and low-stock threshold",
        "TODO: Role-safe pricing visibility enforcement",
      ]}
    />
  );
}
