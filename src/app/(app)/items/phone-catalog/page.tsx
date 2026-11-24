import Link from "next/link";
import { ArrowRight, BarChart3, Boxes, LayoutGrid, List, Smartphone } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ColorChip, RamChip, SpecChips, StorageChip } from "@/components/ui/spec-chips";
import { HorizontalBars, type BarDatum } from "@/components/items/catalog-charts";
import { formatMoney } from "@/lib/currency";
import { resolvePhoneColor } from "@/lib/phone-colors";
import { compareSizes } from "@/lib/variant-specs";

type Tab = "variants" | "models" | "stats";
type SearchParams = { tab?: string; search?: string; make?: string; storage?: string; ram?: string; color?: string; minPrice?: string; maxPrice?: string; inStock?: string; view?: string };

const STATUS_META: Record<string, { label: string; color: string }> = {
  InStock: { label: "In stock", color: "#10b981" },
  Reserved: { label: "Reserved", color: "#f59e0b" },
  Sold: { label: "Sold", color: "#94a3b8" },
  Returned: { label: "Returned", color: "#0ea5e9" },
  Repair: { label: "In repair", color: "#8b5cf6" },
  WrittenOff: { label: "Written off", color: "#ef4444" },
};

const DAY = 86_400_000;

export default async function PhoneCatalogPage({ searchParams = {} }: { searchParams?: SearchParams }) {
  const tab: Tab = searchParams.tab === "models" || searchParams.tab === "stats" ? searchParams.tab : "variants";
  const view = searchParams.view === "list" ? "list" : "grid";
  const search = searchParams.search?.trim().toLowerCase() || "";
  const make = searchParams.make || "";
  const storageFilter = searchParams.storage || "";
  const ramFilter = searchParams.ram || "";
  const colorFilter = searchParams.color || "";
  const minPrice = searchParams.minPrice ? Number(searchParams.minPrice) : null;
  const maxPrice = searchParams.maxPrice ? Number(searchParams.maxPrice) : null;
  const inStockOnly = searchParams.inStock === "1";

  const [allModels, recentSaleItems] = await Promise.all([
    prisma.phoneModel.findMany({
      where: { deletedAt: null },
      orderBy: [{ brand: "asc" }, { modelName: "asc" }],
      include: {
        variants: {
          where: { deletedAt: null },
          include: { phones: { where: { deletedAt: null }, select: { status: true, retailPrice: true, wholesalePrice: true, createdAt: true } } },
        },
      },
    }),
    tab === "stats"
      ? prisma.saleItem.findMany({
          where: { phoneId: { not: null }, sale: { status: "Completed", saleDate: { gte: new Date(Date.now() - 90 * DAY) } } },
          select: { lineTotal: true, phone: { select: { phoneVariant: { select: { phoneModel: { select: { brand: true, modelName: true } } } } } } },
        })
      : Promise.resolve([]),
  ]);

  // ---- Per-variant facts ----
  const variants = allModels.flatMap((model) =>
    model.variants.map((variant) => {
      const inStock = variant.phones.filter((phone) => phone.status === "InStock");
      const prices = inStock.map((phone) => Number(phone.retailPrice ?? 0)).filter((price) => price > 0);
      return {
        ...variant,
        model,
        modelLabel: `${model.brand} ${model.modelName}`,
        inStock: inStock.length,
        sold: variant.phones.filter((phone) => phone.status === "Sold").length,
        minPrice: prices.length ? Math.min(...prices) : null,
        maxPrice: prices.length ? Math.max(...prices) : null,
      };
    })
  );

  const distinct = (values: (string | null)[], sizes = false) => {
    const list = Array.from(new Set(values.filter((value): value is string => Boolean(value))));
    return sizes ? list.sort(compareSizes) : list.sort((a, b) => a.localeCompare(b));
  };
  const makes = distinct(allModels.map((model) => model.brand));
  const storages = distinct(variants.map((variant) => variant.storage), true);
  const rams = distinct(variants.map((variant) => variant.ram), true);
  const colors = distinct(variants.map((variant) => variant.color));

  const filtered = variants.filter((variant) => {
    if (make && variant.model.brand !== make) return false;
    if (search && !`${variant.modelLabel} ${variant.variantName} ${variant.color ?? ""} ${variant.storage ?? ""}`.toLowerCase().includes(search)) return false;
    if (storageFilter && variant.storage !== storageFilter) return false;
    if (ramFilter && variant.ram !== ramFilter) return false;
    if (colorFilter && variant.color !== colorFilter) return false;
    if (inStockOnly && !variant.inStock) return false;
    if (minPrice !== null && (variant.maxPrice ?? 0) < minPrice) return false;
    if (maxPrice !== null && variant.minPrice !== null && variant.minPrice > maxPrice) return false;
    return true;
  });
  filtered.sort((a, b) => a.modelLabel.localeCompare(b.modelLabel) || compareSizes(a.storage ?? "", b.storage ?? "") || (a.color ?? "").localeCompare(b.color ?? ""));

  const priceRange = (min: number | null, max: number | null) => (min === null ? "⚠ No price set" : min === max ? formatMoney(min) : `${formatMoney(min)} – ${formatMoney(max)}`);
  const extraSpecs = (variant: (typeof variants)[number]) =>
    ([
      ["Screen", variant.screenSize],
      ["Chip", variant.processor],
      ["Camera", variant.camera],
      ["Battery", variant.battery],
      ["OS", variant.os],
      ["Network", variant.networkType],
    ] as const).filter(([, value]) => value) as [string, string][];

  const tabHref = (next: Tab, extra: Record<string, string> = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) if (value && key !== "tab" && !(key in extra)) params.set(key, String(value));
    for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
    if (next !== "variants") params.set("tab", next);
    const query = params.toString();
    return `/items/phone-catalog${query ? `?${query}` : ""}`;
  };
  const hasFilters = Boolean(search || make || storageFilter || ramFilter || colorFilter || minPrice || maxPrice || inStockOnly);
  const selectClass = "w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

  const tabs: { id: Tab; label: string; icon: typeof Smartphone; count?: number }[] = [
    { id: "variants", label: "Variants", icon: Smartphone, count: variants.length },
    { id: "models", label: "Models", icon: Boxes, count: allModels.length },
    { id: "stats", label: "Stats", icon: BarChart3 },
  ];

  return (
    <div>
      <PageHeader
        title="Phone Catalog"
        subtitle="Browse every variant and model, and see stock and sales at a glance"
        help={
          <p>
            Read-only catalog. <b>Variants</b> lists every storage/RAM/color configuration with specs, price range and stock. <b>Models</b> groups them by phone with their
            options. <b>Stats</b> charts stock and sales. To add or edit, use the Phones page.
          </p>
        }
      />

      <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">
        {tabs.map((entry) => (
          <Link
            key={entry.id}
            href={tabHref(entry.id)}
            role="tab"
            aria-selected={tab === entry.id}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${tab === entry.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            <entry.icon className="size-4" />
            {entry.label}
            {entry.count !== undefined ? <span className={`rounded-full px-1.5 text-xs ${tab === entry.id ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>{entry.count}</span> : null}
          </Link>
        ))}
      </div>

      {tab !== "stats" ? (
        <form method="get" className="mb-4 grid gap-2 rounded-xl border border-slate-200 bg-white/80 p-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-10">
          {tab !== "variants" ? <input type="hidden" name="tab" value={tab} /> : null}
          <input type="hidden" name="view" value={view} />
          <input name="search" defaultValue={searchParams.search ?? ""} placeholder="Search model, variant, color…" className={`${selectClass} sm:col-span-2`} />
          <select name="make" defaultValue={make} className={selectClass}>
            <option value="">All makes</option>
            {makes.map((value) => <option key={value}>{value}</option>)}
          </select>
          <select name="storage" defaultValue={storageFilter} className={selectClass}>
            <option value="">All storage</option>
            {storages.map((value) => <option key={value}>{value}</option>)}
          </select>
          <select name="ram" defaultValue={ramFilter} className={selectClass}>
            <option value="">All RAM</option>
            {rams.map((value) => <option key={value}>{value}</option>)}
          </select>
          <select name="color" defaultValue={colorFilter} className={selectClass}>
            <option value="">All colors</option>
            {colors.map((value) => <option key={value}>{value}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2 sm:col-span-2 lg:col-span-1 xl:col-span-2">
            <input name="minPrice" type="number" min={0} defaultValue={searchParams.minPrice ?? ""} placeholder="Min price" aria-label="Minimum retail price" className={selectClass} />
            <input name="maxPrice" type="number" min={0} defaultValue={searchParams.maxPrice ?? ""} placeholder="Max price" aria-label="Maximum retail price" className={selectClass} />
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
            <input type="checkbox" name="inStock" value="1" defaultChecked={inStockOnly} /> In stock only
          </label>
          <div className="flex gap-2">
            <button className="btn btn-md btn-primary flex-1">Apply</button>
            {hasFilters ? <Link href={`/items/phone-catalog?${tab !== "variants" ? `tab=${tab}&` : ""}view=${view}`} className="btn btn-md btn-secondary">Clear</Link> : null}
          </div>
        </form>
      ) : null}

      {tab === "variants" ? (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm text-slate-600">
              {filtered.length} of {variants.length} variants · {filtered.reduce((sum, variant) => sum + variant.inStock, 0)} units in stock
            </p>
            <div className="flex overflow-hidden rounded-lg border border-slate-300 text-sm">
              <Link href={tabHref("variants", { view: "grid" })} aria-label="Grid view" className={`px-2.5 py-1.5 ${view === "grid" ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}><LayoutGrid className="size-4" /></Link>
              <Link href={tabHref("variants", { view: "list" })} aria-label="List view" className={`px-2.5 py-1.5 ${view === "list" ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}><List className="size-4" /></Link>
            </div>
          </div>
          {view === "grid" ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filtered.map((variant) => {
                const swatch = resolvePhoneColor(variant.color);
                const specs = extraSpecs(variant);
                return (
                  <Link key={variant.id} href={`/items/phones/variants/${variant.id}`} className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                    <div className="h-1.5" style={{ background: swatch ?? "#e2e8f0" }} aria-hidden="true" />
                    <div className="flex flex-1 flex-col p-4">
                      <p className="text-xs font-medium text-slate-500">{variant.modelLabel}</p>
                      <p className="mt-0.5 font-semibold text-slate-900 group-hover:underline">{variant.variantName}</p>
                      <SpecChips color={variant.color} storage={variant.storage} ram={variant.ram} className="mt-2 flex" />
                      {specs.length ? (
                        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                          {specs.slice(0, 4).map(([label, value]) => (
                            <div key={label} className="min-w-0">
                              <dt className="text-slate-400">{label}</dt>
                              <dd className="truncate text-slate-700" title={value}>{value}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                      <div className="mt-auto flex items-end justify-between gap-2 pt-4">
                        <span className="min-w-0">
                          <span className="block text-[11px] text-slate-400">Retail (in stock)</span>
                          <span className="block truncate text-sm font-semibold text-slate-900">{priceRange(variant.minPrice, variant.maxPrice)}</span>
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${variant.inStock ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{variant.inStock} in stock</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
              {!filtered.length ? <p className="text-sm text-slate-500">No variants match these filters.</p> : null}
            </div>
          ) : (
            <Card className="p-0">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2.5">Model</th>
                      <th className="px-3 py-2.5">Variant</th>
                      <th className="px-3 py-2.5">Key specs</th>
                      <th className="px-3 py-2.5 text-right">Retail (in stock)</th>
                      <th className="px-3 py-2.5 text-right">In stock</th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((variant) => (
                      <tr key={variant.id} className="border-b border-slate-100 align-top hover:bg-slate-50/70">
                        <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-900">{variant.modelLabel}</td>
                        <td className="px-3 py-2.5">
                          <span className="block text-slate-800">{variant.variantName}</span>
                          <SpecChips color={variant.color} storage={variant.storage} ram={variant.ram} className="mt-1 flex" />
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="flex max-w-md flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600">
                            {extraSpecs(variant).map(([label, value]) => (
                              <span key={label}><span className="text-slate-400">{label}</span> {value}</span>
                            ))}
                            {!extraSpecs(variant).length ? <span className="text-slate-400">—</span> : null}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-slate-800">{priceRange(variant.minPrice, variant.maxPrice)}</td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${variant.inStock ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{variant.inStock}</span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Link href={`/items/phones/variants/${variant.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-900">
                            Open <ArrowRight className="size-3.5" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                    {!filtered.length ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-slate-500">No variants match these filters.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      ) : null}

      {tab === "models" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {allModels
            .map((model) => ({ model, list: filtered.filter((variant) => variant.model.id === model.id) }))
            .filter(({ list, model }) => list.length || (!hasFilters && !model.variants.length))
            .map(({ model, list }) => {
              const inStock = list.reduce((sum, variant) => sum + variant.inStock, 0);
              const sold = list.reduce((sum, variant) => sum + variant.sold, 0);
              const mins = list.map((variant) => variant.minPrice).filter((value): value is number => value !== null);
              const maxs = list.map((variant) => variant.maxPrice).filter((value): value is number => value !== null);
              const stockedColors = distinct(list.map((variant) => variant.color));
              return (
                <Card key={model.id} className="flex flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{model.brand}</p>
                      <p className="truncate text-lg font-semibold text-slate-900">{model.modelName}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${inStock ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{inStock} in stock</span>
                  </div>
                  {stockedColors.length ? (
                    <div className="mt-3 flex -space-x-1" aria-label="Colors">
                      {stockedColors.map((color) => (
                        <span key={color} title={color} className="size-5 rounded-full ring-2 ring-white" style={{ background: resolvePhoneColor(color) ?? "repeating-linear-gradient(45deg,#cbd5e1 0 2px,#fff 2px 4px)" }} />
                      ))}
                    </div>
                  ) : null}
                  {/* responsive-ok: three short numbers */}
                  <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 px-3 py-2 text-center text-xs">
                    <div><dt className="text-slate-500">Variants</dt><dd className="text-base font-semibold text-slate-900">{list.length}</dd></div>
                    <div><dt className="text-slate-500">In stock</dt><dd className="text-base font-semibold text-slate-900">{inStock}</dd></div>
                    <div><dt className="text-slate-500">Sold</dt><dd className="text-base font-semibold text-slate-900">{sold}</dd></div>
                  </dl>
                  <div className="mt-3 grid gap-1.5 text-xs">
                    <div className="flex flex-wrap items-center gap-1"><span className="w-14 text-slate-500">Colors</span>{stockedColors.map((value) => <ColorChip key={value} color={value} />)}{!stockedColors.length ? <span className="text-slate-400">—</span> : null}</div>
                    <div className="flex flex-wrap items-center gap-1"><span className="w-14 text-slate-500">Storage</span>{distinct(list.map((variant) => variant.storage), true).map((value) => <StorageChip key={value} value={value} />)}</div>
                    {distinct(list.map((variant) => variant.ram)).length ? <div className="flex flex-wrap items-center gap-1"><span className="w-14 text-slate-500">RAM</span>{distinct(list.map((variant) => variant.ram), true).map((value) => <RamChip key={value} value={value} />)}</div> : null}
                  </div>
                  <div className="mt-auto flex items-end justify-between gap-2 pt-4">
                    <span className="min-w-0">
                      <span className="block text-[11px] text-slate-400">Retail (in stock)</span>
                      <span className="block truncate text-sm font-semibold text-slate-900">{priceRange(mins.length ? Math.min(...mins) : null, maxs.length ? Math.max(...maxs) : null)}</span>
                    </span>
                    <Link href={tabHref("variants", { search: model.modelName })} className="btn btn-xs btn-secondary shrink-0">
                      Variants <ArrowRight className="size-3.5" />
                    </Link>
                  </div>
                </Card>
              );
            })}
        </div>
      ) : null}

      {tab === "stats" ? (
        <StatsView variants={variants} recentSaleItems={recentSaleItems} />
      ) : null}
    </div>
  );
}

function StatsView({
  variants,
  recentSaleItems,
}: {
  variants: { modelLabel: string; color: string | null; storage: string | null; inStock: number; minPrice: number | null; phones: { status: string; retailPrice: unknown; createdAt: Date }[] }[];
  recentSaleItems: { lineTotal: unknown; phone: { phoneVariant: { phoneModel: { brand: string; modelName: string } } } | null }[];
}) {
  const sum = (map: Map<string, number>, key: string, value: number) => map.set(key, (map.get(key) ?? 0) + value);
  const toBars = (map: Map<string, number>, extra?: (label: string) => Partial<BarDatum>) =>
    Array.from(map, ([label, value]) => ({ label, value, ...(extra?.(label) ?? {}) }))
      .filter((datum) => datum.value > 0)
      .sort((a, b) => b.value - a.value);

  const byModel = new Map<string, number>();
  const byColor = new Map<string, number>();
  const byStorage = new Map<string, number>();
  const byStatus = new Map<string, number>();
  const priceSums = new Map<string, { total: number; count: number }>();
  const aging = new Map<string, number>([["0–30 days", 0], ["31–60 days", 0], ["61–90 days", 0], ["90+ days", 0]]);
  const now = Date.now();
  let stockValue = 0;

  for (const variant of variants) {
    sum(byModel, variant.modelLabel, variant.inStock);
    if (variant.color) sum(byColor, variant.color, variant.inStock);
    if (variant.storage) sum(byStorage, variant.storage, variant.inStock);
    for (const phone of variant.phones) {
      sum(byStatus, phone.status, 1);
      if (phone.status !== "InStock") continue;
      const price = Number(phone.retailPrice ?? 0);
      stockValue += price;
      if (price > 0) {
        const entry = priceSums.get(variant.modelLabel) ?? { total: 0, count: 0 };
        priceSums.set(variant.modelLabel, { total: entry.total + price, count: entry.count + 1 });
      }
      const age = (now - phone.createdAt.getTime()) / DAY;
      const bucket = age <= 30 ? "0–30 days" : age <= 60 ? "31–60 days" : age <= 90 ? "61–90 days" : "90+ days";
      sum(aging, bucket, 1);
    }
  }
  const salesByModel = new Map<string, number>();
  const unitsSoldByModel = new Map<string, number>();
  for (const item of recentSaleItems) {
    if (!item.phone) continue;
    const label = `${item.phone.phoneVariant.phoneModel.brand} ${item.phone.phoneVariant.phoneModel.modelName}`;
    sum(salesByModel, label, Number(item.lineTotal));
    sum(unitsSoldByModel, label, 1);
  }

  const totalInStock = variants.reduce((total, variant) => total + variant.inStock, 0);
  const statusBars = toBars(byStatus, (label) => ({ label: STATUS_META[label]?.label ?? label, color: STATUS_META[label]?.color }));
  const kpis = [
    { label: "Units in stock", value: String(totalInStock) },
    { label: "Stock retail value", value: formatMoney(stockValue) },
    { label: "Variants in stock", value: `${variants.filter((variant) => variant.inStock).length} / ${variants.length}` },
    { label: "Sold (last 90 days)", value: String(recentSaleItems.filter((item) => item.phone).length) },
  ];

  return (
    <div className="grid gap-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs text-slate-500">{kpi.label}</p>
            <p className="mt-0.5 truncate text-lg font-semibold text-slate-900 sm:text-xl">{kpi.value}</p>
          </div>
        ))}
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-1 text-base font-semibold">Stock by model</h2>
          <p className="mb-3 text-xs text-slate-500">Units in stock right now.</p>
          <HorizontalBars data={toBars(byModel)} empty="Nothing in stock." />
        </Card>
        <Card>
          <h2 className="mb-1 text-base font-semibold">Stock by color</h2>
          <p className="mb-3 text-xs text-slate-500">Each bar is painted in the phone color it counts.</p>
          <HorizontalBars data={toBars(byColor, (label) => ({ color: resolvePhoneColor(label) ?? undefined }))} empty="Nothing in stock." />
        </Card>
        <Card>
          <h2 className="mb-1 text-base font-semibold">Stock by storage</h2>
          <p className="mb-3 text-xs text-slate-500">Units in stock per storage size.</p>
          <HorizontalBars data={toBars(byStorage).sort((a, b) => compareSizes(a.label, b.label))} empty="Nothing in stock." />
        </Card>
        <Card>
          <h2 className="mb-1 text-base font-semibold">All units by status</h2>
          <p className="mb-3 text-xs text-slate-500">Every registered unit (not deleted), by its current status.</p>
          <HorizontalBars data={statusBars} />
        </Card>
        <Card>
          <h2 className="mb-1 text-base font-semibold">Stock age</h2>
          <p className="mb-3 text-xs text-slate-500">How long in-stock units have been waiting since they were registered — older stock may need a price cut.</p>
          <HorizontalBars data={Array.from(aging, ([label, value]) => ({ label, value }))} empty="Nothing in stock." />
        </Card>
        <Card>
          <h2 className="mb-1 text-base font-semibold">Phone sales by model — last 90 days</h2>
          <p className="mb-3 text-xs text-slate-500">Revenue from completed sales; hover for units sold.</p>
          <HorizontalBars data={toBars(salesByModel, (label) => ({ detail: `${unitsSoldByModel.get(label) ?? 0} units sold` }))} money empty="No phone sales in the last 90 days." />
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="mb-1 text-base font-semibold">Average retail price by model</h2>
          <p className="mb-3 text-xs text-slate-500">Mean retail price of in-stock units (units without a price are left out).</p>
          <HorizontalBars
            data={Array.from(priceSums, ([label, entry]) => ({ label, value: Math.round(entry.total / entry.count), detail: `${entry.count} priced unit${entry.count === 1 ? "" : "s"}` })).sort((a, b) => b.value - a.value)}
            money
            empty="No priced units in stock."
          />
        </Card>
      </div>
    </div>
  );
}
