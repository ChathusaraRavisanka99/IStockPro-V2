import { ModulePlaceholder } from "@/components/ui/module-placeholder";

export default function OtherItemsPage() {
  return (
    <ModulePlaceholder
      title="Items - Other"
      subtitle="Generic accessory inventory"
      todos={[
        "TODO: CRUD for non-cable/non-charger accessories",
        "TODO: SKU-based search integration",
        "TODO: Sales and returns quantity adjustments",
      ]}
    />
  );
}
