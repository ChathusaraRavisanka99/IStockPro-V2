import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { canViewCost } from "@/lib/rbac";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ListControls } from "@/components/ui/list-controls";
import { Pagination } from "@/components/ui/pagination";
import { parsePage, parsePageSize } from "@/lib/pagination";
import { formatMoney } from "@/lib/currency";
import { formatVariantSpecs } from "@/lib/format-item-name";
import { PRICE_CHANGE_ACTION, PRICE_FIELD_LABELS, type PriceChangeDetails, type PriceField } from "@/lib/price-history";
import { SpecChips } from "@/components/ui/spec-chips";
import { PriceTimelineChart, type PricePoint } from "@/components/items/price-timeline-chart";
import { EntityLink } from "@/components/ui/entity-link";

type Props = { searchParams: { search?: string; filter?: string; from?: string; to?: string; page?: string; pageSize?: string; sel?: string } };

type TimelineUnit = { id: string; createdAt: Date; retailPrice: unknown; wholesalePrice: unknown };
type TimelineLog = { entityId: string; createdAt: Date; details: unknown };

/**
 * Average listed price over time for a set of units: each unit's price is reconstructed from
 * its registration (original price = the first change's old price, else its current price)
 * plus every logged change, then averaged at each event date across units registered by then.
 */
function buildPriceTimeline(units: TimelineUnit[], logs: TimelineLog[]): PricePoint[] {
  type Change = { at: number; price: number };
  const series = new Map<string, { start: number; retail: Change[]; wholesale: Change[] }>();
  for (const unit of units) {
    const unitLogs = logs.filter((log) => log.entityId === unit.id).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const build = (field: PriceField, current: unknown): Change[] => {
      const changes = unitLogs.map((log) => ({ log, details: log.details as PriceChangeDetails })).filter(({ details }) => details?.field === field);
      const original = changes.length ? changes[0].details.oldPrice : Number(current ?? 0);
      return [{ at: unit.createdAt.getTime(), price: original }, ...changes.map(({ log, details }) => ({ at: log.createdAt.getTime(), price: details.newPrice }))];
    };
    series.set(unit.id, { start: unit.createdAt.getTime(), retail: build("retailPrice", unit.retailPrice), wholesale: build("wholesalePrice", unit.wholesalePrice) });
  }
  const priceAt = (changes: Change[], at: number) => {
    let price: number | null = null;
    for (const change of changes) if (change.at <= at) price = change.price;
    return price;
  };
  const events = new Map<number, string>();
  for (const unit of units) events.set(unit.createdAt.getTime(), "unit registered");
  for (const log of logs) {
    const details = log.details as PriceChangeDetails;
    events.set(log.createdAt.getTime(), `${details.field === "retailPrice" ? "retail" : "wholesale"} price changed`);
  }
  events.set(Date.now(), "today");
  const average = (values: (number | null)[]) => {
    const priced = values.filter((value): value is number => value !== null && value > 0);
    return priced.length ? Math.round(priced.reduce((sum, value) => sum + value, 0) / priced.length) : null;
  };
  return Array.from(events)
    .sort((a, b) => a[0] - b[0])
    .map(([at, event]) => {
      const active = Array.from(series.values()).filter((entry) => entry.start <= at);
      return {
        date: new Date(at).toISOString(),
        retail: average(active.map((entry) => priceAt(entry.retail, at))),
        wholesale: average(active.map((entry) => priceAt(entry.wholesale, at))),
        units: active.length,
        event,
      };
    })
    .filter((point) => point.units > 0);
}

export default async function PhonePriceHistoryPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  // Wholesale pricing is gated like cost elsewhere (e.g. the lot register form), so staff
  // only see retail changes.
  const showWholesale = canViewCost(session?.user?.role as "admin" | "manager" | "staff" | undefined);
  const search = searchParams.search?.trim() || "";
  const requestedField = searchParams.filter === "retailPrice" || searchParams.filter === "wholesalePrice" ? searchParams.filter : "";
  const field: PriceField | "" = !showWholesale ? "retailPrice" : requestedField;
  const fromDate = searchParams.from?.trim() || "";
  const toDate = searchParams.to?.trim() || "";
  const page = parsePage(searchParams.page);
  const pageSize = parsePageSize(searchParams.pageSize);
  const sel = searchParams.sel || "";
  const [selKind, selId] = sel.includes(":") ? sel.split(":") : ["", ""];

  const catalog = await prisma.phoneModel.findMany({
    where: { deletedAt: null },
    orderBy: [{ brand: "asc" }, { modelName: "asc" }],
    select: { id: true, brand: true, modelName: true, variants: { where: { deletedAt: null }, orderBy: { variantName: "asc" }, select: { id: true, variantName: true } } },
  });
  const selectedModel = selKind === "m" ? catalog.find((model) => model.id === selId) : selKind === "v" ? catalog.find((model) => model.variants.some((variant) => variant.id === selId)) : undefined;
  const selectedVariant = selKind === "v" ? selectedModel?.variants.find((variant) => variant.id === selId) : undefined;
  const selectionLabel = selectedModel ? `${selectedModel.brand} ${selectedModel.modelName}${selectedVariant ? ` — ${selectedVariant.variantName}` : " (all variants)"}` : "";
  const selectionUnits = selectedModel
    ? await prisma.phone.findMany({
        where: { deletedAt: null, ...(selectedVariant ? { phoneVariantId: selectedVariant.id } : { phoneVariant: { phoneModelId: selectedModel.id } }) },
        select: { id: true, createdAt: true, retailPrice: true, wholesalePrice: true },
      })
    : [];
  const selectionLogs = selectionUnits.length
    ? await prisma.auditLog.findMany({ where: { action: PRICE_CHANGE_ACTION, entityType: "Phone", entityId: { in: selectionUnits.map((unit) => unit.id) } }, select: { entityId: true, createdAt: true, details: true } })
    : [];
  const timeline = selectedModel ? buildPriceTimeline(selectionUnits, showWholesale ? selectionLogs : selectionLogs.filter((log) => (log.details as PriceChangeDetails)?.field === "retailPrice")) : [];

  const matchingPhoneIds = search
    ? (
        await prisma.phone.findMany({
          where: {
            OR: [
              { imei: { contains: search, mode: "insensitive" } },
              { phoneVariant: { variantName: { contains: search, mode: "insensitive" } } },
              { phoneVariant: { phoneModel: { modelName: { contains: search, mode: "insensitive" } } } },
              { phoneVariant: { phoneModel: { brand: { contains: search, mode: "insensitive" } } } },
              { lot: { lotNumber: { contains: search, mode: "insensitive" } } },
            ],
          },
          select: { id: true },
          take: 5000,
        })
      ).map((phone) => phone.id)
    : null;

  const where: Prisma.AuditLogWhereInput = {
    action: PRICE_CHANGE_ACTION,
    entityType: "Phone",
    ...(matchingPhoneIds || selectedModel
      ? {
          entityId: {
            in: selectedModel
              ? selectionUnits.map((unit) => unit.id).filter((id) => !matchingPhoneIds || matchingPhoneIds.includes(id))
              : matchingPhoneIds!,
          },
        }
      : {}),
    ...(field ? { details: { path: ["field"], equals: field } } : {}),
    ...(fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate ? { gte: new Date(`${fromDate}T00:00:00`) } : {}),
            ...(toDate ? { lte: new Date(`${toDate}T23:59:59.999`) } : {}),
          },
        }
      : {}),
  };

  const [logs, total] = await prisma.$transaction([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { user: { select: { name: true, username: true } } } }),
    prisma.auditLog.count({ where }),
  ]);

  const phones = await prisma.phone.findMany({
    where: { id: { in: Array.from(new Set(logs.map((log) => log.entityId))) } },
    select: { id: true, imei: true, deletedAt: true, retailPrice: true, wholesalePrice: true, lot: { select: { id: true, lotNumber: true, deletedAt: true } }, phoneVariant: { include: { phoneModel: true } } },
  });
  const phoneById = new Map(phones.map((phone) => [phone.id, phone]));

  return (
    <div>
      <PageHeader
        title="Phone Price History"
        subtitle={showWholesale ? "Every change to a unit's retail or wholesale price" : "Every change to a unit's retail price"}
        help={
          <p>
            Each time a unit&apos;s {showWholesale ? "retail or wholesale " : "retail "}price is edited (from the unit&apos;s Edit button on its lot page), the old and new
            price is recorded here with who changed it and when. Search by IMEI, brand, model, variant or lot number. Changes made before this history was added aren&apos;t listed.
          </p>
        }
      />
      <div className="mb-4">
        <Link href="/items/phones" className="text-sm text-slate-700 underline">Back to Phones</Link>
      </div>

      <Card className="mb-4">
        <form method="get" className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="grid min-w-0 flex-1 gap-1 text-xs font-medium text-slate-600">
            Show price over time for
            <select name="sel" defaultValue={sel} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value="">— Choose a phone model or variant —</option>
              {catalog.map((model) => (
                <optgroup key={model.id} label={`${model.brand} ${model.modelName}`}>
                  <option value={`m:${model.id}`}>All variants of {model.brand} {model.modelName}</option>
                  {model.variants.map((variant) => (
                    <option key={variant.id} value={`v:${variant.id}`}>
                      {model.modelName} — {variant.variantName}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <button className="btn btn-md btn-primary">Show</button>
          {sel ? <Link href="/items/phones/price-history" className="btn btn-md btn-secondary">Clear</Link> : null}
        </form>
        {selectedModel ? (
          <div className="mt-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">{selectionLabel}</h2>
              <p className="text-xs text-slate-500">
                {selectionUnits.length} unit{selectionUnits.length === 1 ? "" : "s"} · {selectionLogs.length} price change{selectionLogs.length === 1 ? "" : "s"} · average of each unit&apos;s listed price at that time
              </p>
            </div>
            <PriceTimelineChart data={timeline} showWholesale={showWholesale} />
            {timeline.length ? (
              <details className="mt-3 rounded-lg border border-slate-200">
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-700">Show these points as a table</summary>
                <div className="overflow-x-auto border-t border-slate-100">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Event</th>
                        <th className="px-3 py-2 text-right">Units</th>
                        <th className="px-3 py-2 text-right">Avg retail</th>
                        {showWholesale ? <th className="px-3 py-2 text-right">Avg wholesale</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {[...timeline].reverse().map((point) => (
                        <tr key={point.date} className="border-t border-slate-100">
                          <td className="whitespace-nowrap px-3 py-1.5">{point.date.slice(0, 10)}</td>
                          <td className="px-3 py-1.5 text-slate-600">{point.event}</td>
                          <td className="px-3 py-1.5 text-right">{point.units}</td>
                          <td className="whitespace-nowrap px-3 py-1.5 text-right">{point.retail !== null ? formatMoney(point.retail) : "—"}</td>
                          {showWholesale ? <td className="whitespace-nowrap px-3 py-1.5 text-right">{point.wholesale !== null ? formatMoney(point.wholesale) : "—"}</td> : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Pick a model or a specific variant to chart how its prices moved over time; the change log below then shows just that selection.</p>
        )}
      </Card>

      <ListControls
        search={search}
        filter={field}
        filterLabel={showWholesale ? "Retail & wholesale" : undefined}
        filterOptions={showWholesale ? (Object.keys(PRICE_FIELD_LABELS) as PriceField[]).map((value) => ({ value, label: PRICE_FIELD_LABELS[value] })) : []}
        placeholder="Search IMEI, model, variant or lot"
        showViewToggle={false}
        dateRange={{ from: fromDate, to: toDate }}
        preserve={{ sel }}
      />

      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Phone</th>
                <th className="px-2 py-2">IMEI</th>
                <th className="px-2 py-2">Lot</th>
                <th className="px-2 py-2">Price</th>
                <th className="px-2 py-2 text-right">Old</th>
                <th className="px-2 py-2 text-right">New</th>
                <th className="px-2 py-2 text-right">Change</th>
                <th className="px-2 py-2">Current</th>
                <th className="px-2 py-2">Changed by</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const details = log.details as PriceChangeDetails | null;
                if (!details) return null;
                const phone = phoneById.get(log.entityId);
                const diff = details.newPrice - details.oldPrice;
                const pct = details.oldPrice > 0 ? (diff / details.oldPrice) * 100 : null;
                const current = phone ? Number(phone[details.field] ?? 0) : null;
                const specs = phone ? formatVariantSpecs(phone.phoneVariant) : "";
                return (
                  <tr key={log.id} className="border-b border-slate-200">
                    <td className="whitespace-nowrap px-2 py-2">{log.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                    <td className="px-2 py-2">
                      {phone ? (
                        <>
                          <EntityLink kind="phone" id={phone.id}>
                            {phone.phoneVariant.phoneModel.brand} {phone.phoneVariant.phoneModel.modelName} - {phone.phoneVariant.variantName}
                          </EntityLink>
                          {specs ? <SpecChips color={phone.phoneVariant.color} storage={phone.phoneVariant.storage} ram={phone.phoneVariant.ram} className="mt-1 flex" /> : null}
                          {phone.deletedAt ? <p className="text-xs text-red-700">Archived</p> : null}
                        </>
                      ) : (
                        <span className="text-slate-500">Deleted unit</span>
                      )}
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">{phone?.imei ?? "-"}</td>
                    <td className="px-2 py-2">
                      {phone ? <EntityLink kind="lot" id={phone.lot.id}>{phone.lot.lotNumber}</EntityLink> : "-"}
                    </td>
                    <td className="px-2 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${details.field === "retailPrice" ? "bg-sky-100 text-sky-800" : "bg-violet-100 text-violet-800"}`}>{PRICE_FIELD_LABELS[details.field]}</span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right">{formatMoney(details.oldPrice)}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-medium">{formatMoney(details.newPrice)}</td>
                    <td className={`whitespace-nowrap px-2 py-2 text-right ${diff > 0 ? "text-green-700" : "text-red-700"}`}>
                      {diff > 0 ? "+" : "-"}
                      {formatMoney(Math.abs(diff))}
                      {pct !== null ? <span className="ml-1 text-xs">({diff > 0 ? "+" : ""}{pct.toFixed(1)}%)</span> : null}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">{current !== null ? formatMoney(current) : "-"}</td>
                    <td className="px-2 py-2">{log.user ? log.user.name || log.user.username : "-"}</td>
                  </tr>
                );
              })}
              {!logs.length ? (
                <tr>
                  <td className="px-2 py-5 text-slate-600" colSpan={10}>
                    No price changes recorded{search || field || fromDate || toDate ? " for these filters" : " yet"}.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        query={{ ...(sel ? { sel } : {}), ...(search ? { search } : {}), ...(field && showWholesale ? { filter: field } : {}), ...(fromDate ? { from: fromDate } : {}), ...(toDate ? { to: toDate } : {}) }}
      />
    </div>
  );
}
