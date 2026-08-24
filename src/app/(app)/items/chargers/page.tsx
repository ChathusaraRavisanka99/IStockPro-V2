import { AccessoryCategoryPage } from "@/components/items/accessory-category-page";

export default function ChargersPage({ searchParams }: { searchParams: { search?: string; view?: "list" | "grid" } }) {
  return <AccessoryCategoryPage title="Items - Chargers" category="Charger" route="/items/chargers" searchParams={searchParams} />;
}
