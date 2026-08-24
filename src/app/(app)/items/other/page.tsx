import { AccessoryCategoryPage } from "@/components/items/accessory-category-page";

export default function OtherItemsPage({ searchParams }: { searchParams: { search?: string; view?: "list" | "grid" } }) {
  return <AccessoryCategoryPage title="Items - Other" category="Other" route="/items/other" specFields={[]} searchParams={searchParams} />;
}
