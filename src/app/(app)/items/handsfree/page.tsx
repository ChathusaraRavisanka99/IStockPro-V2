import { AccessoryCategoryPage } from "@/components/items/accessory-category-page";

export default function HandsfreePage({ searchParams }: { searchParams: { search?: string; view?: "list" | "grid" } }) {
  return (
    <AccessoryCategoryPage
      title="Items - Handsfree"
      category="Handsfree"
      route="/items/handsfree"
      specFields={["connectorType"]}
      connectorPlaceholder="Connector type (e.g. 3.5mm Jack, Type-C, Bluetooth)"
      searchParams={searchParams}
    />
  );
}
