import { AccessoryCategoryPage } from "@/components/items/accessory-category-page";

export default function CablesPage({ searchParams }: { searchParams: { search?: string; view?: "list" | "grid" } }) {
  return <AccessoryCategoryPage title="Items - Cables" category="Cable" route="/items/cables" searchParams={searchParams} />;
}
