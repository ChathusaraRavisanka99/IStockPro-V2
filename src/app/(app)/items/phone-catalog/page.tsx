import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PhoneCatalogFilters } from "@/components/items/phone-catalog-filters";

type SearchParams = {
  search?: string;
  make?: string;
  storage?: string;
  ram?: string;
  color?: string;
  minPrice?: string;
  maxPrice?: string;
  view?: "list" | "grid";
};

export default async function PhoneCatalogPage({ searchParams }: { searchParams?: SearchParams }) {
  const search = searchParams?.search?.trim().toLowerCase() || "";
  const make = searchParams?.make || "";
  const storageFilter = searchParams?.storage || "";
  const ramFilter = searchParams?.ram || "";
  const colorFilter = searchParams?.color || "";
  const minPrice = searchParams?.minPrice ? Number(searchParams.minPrice) : null;
  const maxPrice = searchParams?.maxPrice ? Number(searchParams.maxPrice) : null;
  const view = searchParams?.view === "grid" ? "grid" : "list";

  const allModels = await prisma.phoneModel.findMany({
    where: { deletedAt: null },
    orderBy: [{ brand: "asc" }, { modelName: "asc" }],
    include: {
      variants: {
        where: { deletedAt: null },
        orderBy: { variantName: "asc" },
        include: {
          phones: { where: { deletedAt: null }, select: { status: true, retailPrice: true } },
        },
      },
    },
  });

  // Filter option lists are derived from the full, unfiltered dataset so every
  // choice stays selectable no matter what's currently applied.
  const makes = Array.from(new Set(allModels.map((model) => model.brand))).sort().map((value) => ({ value, label: value }));
  const storages = Array.from(new Set(allModels.flatMap((model) => model.variants.map((variant) => variant.storage).filter((value): value is string => Boolean(value))))).sort().map((value) => ({ value, label: value }));
  const rams = Array.from(new Set(allModels.flatMap((model) => model.variants.map((variant) => variant.ram).filter((value): value is string => Boolean(value))))).sort().map((value) => ({ value, label: value }));
  const colors = Array.from(new Set(allModels.flatMap((model) => model.variants.map((variant) => variant.color).filter((value): value is string => Boolean(value))))).sort().map((value) => ({ value, label: value }));

  const allPrices = allModels.flatMap((model) => model.variants.flatMap((variant) => variant.phones.map((phone) => Number(phone.retailPrice ?? 0)))).filter((price) => price > 0);
  const priceBounds = { min: allPrices.length ? Math.min(...allPrices) : 0, max: allPrices.length ? Math.max(...allPrices) : 0 };

  const models = allModels
    .map((model) => {
      if (make && model.brand !== make) return null;
      const variants = model.variants.filter((variant) => {
        if (search && !`${model.brand} ${model.modelName} ${variant.variantName}`.toLowerCase().includes(search)) return false;
        if (storageFilter && variant.storage !== storageFilter) return false;
        if (ramFilter && variant.ram !== ramFilter) return false;
        if (colorFilter && variant.color !== colorFilter) return false;
        if (minPrice !== null || maxPrice !== null) {
          const prices = variant.phones.map((phone) => Number(phone.retailPrice ?? 0)).filter((price) => price > 0);
          if (!prices.length) return false;
          const variantMin = Math.min(...prices);
          const variantMax = Math.max(...prices);
          if (minPrice !== null && variantMax < minPrice) return false;
          if (maxPrice !== null && variantMin > maxPrice) return false;
        }
        return true;
      });
      return variants.length || (!search && !storageFilter && !ramFilter && !colorFilter && minPrice === null && maxPrice === null) ? { ...model, variants } : null;
    })
    .filter((model): model is NonNullable<typeof model> => model !== null && (model.variants.length > 0 || !search));

  const specsFor = (variant: (typeof allModels)[number]["variants"][number]) =>
    (
      [
        ["Color", variant.color],
        ["Storage", variant.storage],
        ["RAM", variant.ram],
        ["Screen", variant.screenSize],
        ["Processor", variant.processor],
        ["Camera", variant.camera],
        ["OS", variant.os],
        ["Network", variant.networkType],
        ["Battery", variant.battery],
      ] as [string, string | null][]
    ).filter(([, value]) => value) as [string, string][];

  const inStockCount = (variant: (typeof allModels)[number]["variants"][number]) => variant.phones.filter((phone) => phone.status === "InStock").length;

  return (
    <div>
      <PageHeader title="Phone Catalog" subtitle="Browse every model and variant with full specifications" />
      <div className="mb-4 flex sm:justify-end">
        <div className="flex w-full rounded-lg border border-slate-300 bg-white p-1 text-sm sm:w-auto">
          <a href={`?${new URLSearchParams({ ...searchParams, view: "list" }).toString()}`} className={`flex-1 rounded-md px-4 py-2 text-center transition sm:flex-none sm:px-3 sm:py-1 ${view === "list" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}>List</a>
          <a href={`?${new URLSearchParams({ ...searchParams, view: "grid" }).toString()}`} className={`flex-1 rounded-md px-4 py-2 text-center transition sm:flex-none sm:px-3 sm:py-1 ${view === "grid" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}>Grid</a>
        </div>
      </div>
      <PhoneCatalogFilters
        view={view}
        search={searchParams?.search || ""}
        make={make}
        storage={storageFilter}
        ram={ramFilter}
        color={colorFilter}
        minPrice={searchParams?.minPrice || ""}
        maxPrice={searchParams?.maxPrice || ""}
        priceBounds={priceBounds}
        makes={makes}
        storages={storages}
        rams={rams}
        colors={colors}
      />

      {view === "list" ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-left text-slate-700">
                  <th className="px-2 py-2">Model</th>
                  <th className="px-2 py-2">Variant</th>
                  <th className="px-2 py-2">Specs</th>
                  <th className="px-2 py-2">In Stock</th>
                  <th className="px-2 py-2">View</th>
                </tr>
              </thead>
              <tbody>
                {models.flatMap((model) =>
                  model.variants.map((variant) => (
                    <tr key={variant.id} className="border-b border-slate-200">
                      <td className="px-2 py-2">{model.brand} {model.modelName}</td>
                      <td className="px-2 py-2">{variant.variantName}</td>
                      <td className="px-2 py-2 text-xs text-slate-600">{specsFor(variant).map(([label, value]) => `${label}: ${value}`).join(" · ") || "-"}</td>
                      <td className="px-2 py-2">{inStockCount(variant)}</td>
                      <td className="px-2 py-2"><Link href={`/items/phones/variants/${variant.id}`} className="text-slate-800 underline">View</Link></td>
                    </tr>
                  )),
                )}
                {!models.some((model) => model.variants.length) ? (
                  <tr>
                    <td className="px-2 py-5 text-slate-600" colSpan={5}>
                      No variants match these filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
      <div className="grid gap-4">
        {models.map((model) => (
          <Card key={model.id}>
            <div className="mb-3">
              <h2 className="text-lg font-semibold text-slate-900">
                {model.brand} {model.modelName}
              </h2>
              <p className="text-xs text-slate-600">Warranty {model.warrantyMonths} months · Low stock threshold {model.lowStockThreshold}</p>
            </div>
            {model.variants.length ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {model.variants.map((variant) => {
                  const specs = specsFor(variant);

                  return (
                    <Link
                      key={variant.id}
                      href={`/items/phones/variants/${variant.id}`}
                      className="block rounded-xl border border-slate-200 p-3 transition hover:border-slate-400 hover:bg-slate-50"
                    >
                      <p className="font-medium text-slate-900">{variant.variantName}</p>
                      {specs.length ? (
                        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
                          {specs.map(([label, value]) => (
                            <div key={label} className="flex justify-between gap-2">
                              <dt>{label}</dt>
                              <dd className="text-right text-slate-800">{value}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <p className="mt-2 text-xs text-slate-500">No specs recorded yet.</p>
                      )}
                      <p className="mt-3 text-sm font-medium text-slate-800">{inStockCount(variant)} in stock</p>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-600">No variants match these filters.</p>
            )}
          </Card>
        ))}
        {!models.length ? (
          <Card>
            <p className="text-sm text-slate-600">No phone models match these filters.</p>
          </Card>
        ) : null}
      </div>
      )}
    </div>
  );
}
