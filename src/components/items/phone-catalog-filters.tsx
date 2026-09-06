import { formatMoney } from "@/lib/currency";

type Option = { value: string; label: string };

type Props = {
  view: "list" | "grid";
  search: string;
  make: string;
  storage: string;
  ram: string;
  color: string;
  minPrice: string;
  maxPrice: string;
  priceBounds: { min: number; max: number };
  makes: Option[];
  storages: Option[];
  rams: Option[];
  colors: Option[];
};

export function PhoneCatalogFilters({ view, search, make, storage, ram, color, minPrice, maxPrice, priceBounds, makes, storages, rams, colors }: Props) {
  const hasActiveFilters = Boolean(search || make || storage || ram || color || minPrice || maxPrice);

  return (
    <form method="get" className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white/70 p-3">
      <input type="hidden" name="view" value={view} />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <input name="search" defaultValue={search} placeholder="Search by model name..." className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:col-span-2 xl:col-span-1" />
        <select name="make" defaultValue={make} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">All Makes</option>
          {makes.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select name="storage" defaultValue={storage} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">All Storage</option>
          {storages.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select name="ram" defaultValue={ram} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">All RAM</option>
          {rams.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select name="color" defaultValue={color} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">All Colors</option>
          {colors.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
      <div className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <label className="grid min-w-0 gap-1 text-xs text-slate-600">
          Min price
          <input name="minPrice" type="number" min={0} step="0.01" defaultValue={minPrice} placeholder={formatMoney(priceBounds.min)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        </label>
        <label className="grid min-w-0 gap-1 text-xs text-slate-600">
          Max price
          <input name="maxPrice" type="number" min={0} step="0.01" defaultValue={maxPrice} placeholder={formatMoney(priceBounds.max)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        </label>
        <div className="flex gap-2">
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">Apply Filters</button>
          {hasActiveFilters ? (
            <a href={`?view=${view}`} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700">Clear</a>
          ) : null}
        </div>
      </div>
    </form>
  );
}
