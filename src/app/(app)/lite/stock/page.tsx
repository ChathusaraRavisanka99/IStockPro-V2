import Link from "next/link";
import { getServerSession } from "next-auth";
import { ChevronDown, Search } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewCost } from "@/lib/rbac";
import { formatMoney } from "@/lib/currency";
import { compareSizes } from "@/lib/variant-specs";
import { GradeBadge, SpecChips } from "@/components/ui/spec-chips";

type Props = { searchParams: { q?: string; model?: string; all?: string } };

/**
 * Lite stock check: one search box (model, variant, color, storage or IMEI), model chips, and a
 * card per variant with its in-stock count and price range; tap a card to see each unit.
 */
export default async function LiteStockPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  const showCost = canViewCost(session?.user?.role as "admin" | "manager" | "staff" | undefined);
  const q = searchParams.q?.trim() ?? "";
  const modelId = searchParams.model ?? "";
  const includeOut = searchParams.all === "1";

  const models = await prisma.phoneModel.findMany({
    where: { deletedAt: null },
    orderBy: [{ brand: "asc" }, { modelName: "asc" }],
    include: {
      variants: {
        where: { deletedAt: null },
        include: {
          phones: {
            where: { deletedAt: null, status: "InStock" },
            orderBy: { createdAt: "desc" },
            select: { id: true, imei: true, grade: true, batteryHealth: true, retailPrice: true, wholesalePrice: true, notes: true, lot: { select: { lotNumber: true } } },
          },
        },
      },
    },
  });

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const cards = models
    .filter((model) => !modelId || model.id === modelId)
    .flatMap((model) =>
      model.variants.map((variant) => {
        const label = `${model.brand} ${model.modelName}`;
        const haystack = `${label} ${variant.variantName} ${variant.color ?? ""} ${variant.storage ?? ""} ${variant.ram ?? ""}`.toLowerCase();
        const imeiHit = terms.length === 1 && /^\d{4,}$/.test(terms[0]) ? variant.phones.filter((phone) => phone.imei.includes(terms[0])) : null;
        const match = !terms.length || terms.every((term) => haystack.includes(term)) || Boolean(imeiHit?.length);
        const prices = variant.phones.map((phone) => Number(phone.retailPrice ?? 0)).filter((price) => price > 0);
        return { model, label, variant, match, units: imeiHit?.length ? imeiHit : variant.phones, min: prices.length ? Math.min(...prices) : null, max: prices.length ? Math.max(...prices) : null, imeiMatch: Boolean(imeiHit?.length) };
      }),
    )
    .filter((card) => card.match && (includeOut || card.variant.phones.length > 0))
    .sort((a, b) => a.label.localeCompare(b.label) || compareSizes(a.variant.storage ?? "", b.variant.storage ?? "") || (a.variant.color ?? "").localeCompare(b.variant.color ?? ""));

  const totalUnits = cards.reduce((sum, card) => sum + card.units.length, 0);
  const href = (next: Record<string, string>) => {
    const params = new URLSearchParams({ ...(q ? { q } : {}), ...(modelId ? { model: modelId } : {}), ...(includeOut ? { all: "1" } : {}), ...next });
    for (const [key, value] of Array.from(params.entries())) if (!value) params.delete(key);
    const query = params.toString();
    return `/lite/stock${query ? `?${query}` : ""}`;
  };
  const price = (min: number | null, max: number | null) => (min === null ? "No price" : min === max ? formatMoney(min) : `${formatMoney(min)} – ${formatMoney(max)}`);

  return (
    <div className="grid gap-3">
      <h1 className="text-xl font-semibold text-slate-950">Stock</h1>

      <form method="get" className="sticky top-14 z-20">
        {modelId ? <input type="hidden" name="model" value={modelId} /> : null}
        {includeOut ? <input type="hidden" name="all" value="1" /> : null}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input name="q" defaultValue={q} placeholder="Model, color, 128, or IMEI…" inputMode="search" className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-9 pr-20 shadow-sm" />
          <button className="btn btn-sm btn-primary absolute right-1.5 top-1/2 -translate-y-1/2">Search</button>
        </div>
      </form>

      <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1">
        <Link href={href({ model: "" })} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${!modelId ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}>
          All models
        </Link>
        {models.map((model) => (
          <Link key={model.id} href={href({ model: model.id })} className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${modelId === model.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}>
            {model.modelName}
          </Link>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {cards.length} variant{cards.length === 1 ? "" : "s"} · {totalUnits} unit{totalUnits === 1 ? "" : "s"} in stock
        </span>
        <Link href={href({ all: includeOut ? "" : "1" })} className="font-medium text-slate-700 underline">
          {includeOut ? "Hide out of stock" : "Show out of stock"}
        </Link>
      </div>

      <ul className="grid gap-2">
        {cards.map((card) => (
          <li key={card.variant.id}>
            <details className="group overflow-hidden rounded-2xl border border-slate-200 bg-white" open={card.imeiMatch}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">
                  <span className="block text-xs text-slate-500">{card.label}</span>
                  <span className="block truncate font-semibold text-slate-900">{card.variant.variantName}</span>
                  <SpecChips color={card.variant.color} storage={card.variant.storage} ram={card.variant.ram} className="mt-1 flex" />
                  <span className="mt-1 block text-sm text-slate-700">{price(card.min, card.max)}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`rounded-full px-2.5 py-1 text-sm font-semibold ${card.units.length ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{card.units.length}</span>
                  <ChevronDown className="size-4 text-slate-400 transition group-open:rotate-180" />
                </span>
              </summary>
              {card.units.length ? (
                <ul className="divide-y divide-slate-100 border-t border-slate-100">
                  {card.units.map((unit) => (
                    <li key={unit.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                      <span className="min-w-0">
                        <span className="block font-mono text-xs text-slate-800">{unit.imei}</span>
                        <span className="text-xs text-slate-500">
                          Lot {unit.lot.lotNumber}
                          {unit.batteryHealth !== null ? ` · battery ${unit.batteryHealth}%` : ""}
                        </span>
                        {unit.notes ? <span className="block truncate text-xs italic text-slate-500">{unit.notes}</span> : null}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <GradeBadge grade={unit.grade} />
                        <span className="text-right">
                          <span className="block font-semibold text-slate-900">{Number(unit.retailPrice ?? 0) > 0 ? formatMoney(unit.retailPrice) : <span className="text-xs font-normal text-slate-400">No price</span>}</span>
                          {showCost && Number(unit.wholesalePrice ?? 0) ? <span className="block text-[11px] text-slate-500">W {formatMoney(unit.wholesalePrice)}</span> : null}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="border-t border-slate-100 px-3 py-3 text-sm text-slate-500">None in stock.</p>
              )}
              <div className="flex gap-2 border-t border-slate-100 px-3 py-2">
                <Link href="/sales" className="btn btn-sm btn-primary flex-1">
                  Sell
                </Link>
                <Link href={`/items/phones/variants/${card.variant.id}`} className="btn btn-sm btn-secondary flex-1">
                  Details
                </Link>
              </div>
            </details>
          </li>
        ))}
        {!cards.length ? <li className="rounded-2xl border border-dashed border-slate-300 px-3 py-8 text-center text-sm text-slate-500">Nothing matches “{q}”.</li> : null}
      </ul>
    </div>
  );
}
