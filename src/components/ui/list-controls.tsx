import Link from "next/link";
import { SearchableSelect } from "@/components/ui/searchable-select";

type FilterOption = {
  label: string;
  value: string;
};

type Props = {
  search?: string;
  filter?: string;
  filterLabel?: string;
  filterOptions?: FilterOption[];
  filter2?: string;
  filter2Label?: string;
  filterOptions2?: FilterOption[];
  placeholder?: string;
  view?: "list" | "grid";
};

export function ListControls({
  search = "",
  filter = "",
  filterLabel,
  filterOptions = [],
  filter2 = "",
  filter2Label,
  filterOptions2 = [],
  placeholder = "Search",
  view = "list",
}: Props) {
  const query = new URLSearchParams();
  if (search) query.set("search", search);
  if (filter) query.set("filter", filter);
  if (filter2) query.set("filter2", filter2);

  const listQuery = new URLSearchParams(query);
  listQuery.set("view", "list");
  const gridQuery = new URLSearchParams(query);
  gridQuery.set("view", "grid");

  return (
    <form method="get" className="mb-4 flex flex-col gap-2 rounded-xl border border-slate-200 bg-white/70 p-3 sm:flex-row sm:items-center">
      <input
        name="search"
        defaultValue={search}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
      />
      {filterOptions.length ? (
        <SearchableSelect name="filter" defaultValue={filter} aria-label={filterLabel || "Filter"} placeholder={filterLabel || "All"} options={filterOptions} />
      ) : null}
      {filterOptions2.length ? (
        <SearchableSelect name="filter2" defaultValue={filter2} aria-label={filter2Label || "Filter"} placeholder={filter2Label || "All"} options={filterOptions2} />
      ) : null}
      <button className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">Apply</button>
      <div className="flex shrink-0 rounded-lg border border-slate-300 bg-white p-1 text-sm">
        <Link href={`?${listQuery.toString()}`} className={`flex-1 rounded-md px-4 py-2 text-center transition sm:flex-none sm:px-3 sm:py-1 ${view === "list" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}>
          List
        </Link>
        <Link href={`?${gridQuery.toString()}`} className={`flex-1 rounded-md px-4 py-2 text-center transition sm:flex-none sm:px-3 sm:py-1 ${view === "grid" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}>
          Grid
        </Link>
      </div>
    </form>
  );
}
