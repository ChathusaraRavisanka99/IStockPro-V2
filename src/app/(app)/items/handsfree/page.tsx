import { AccessoryCategoryPage } from "@/components/items/accessory-category-page";

export default function HandsfreePage({ searchParams }: { searchParams: { search?: string; view?: "list" | "grid" } }) {
  return (
    <AccessoryCategoryPage
      title="Items - Handsfree"
      category="Handsfree"
      route="/items/handsfree"
      specFields={["connectorType"]}
      connectorPlaceholder="Connector (3.5mm/Type-C/Bluetooth)"
      searchParams={searchParams}
    />
  );
}
