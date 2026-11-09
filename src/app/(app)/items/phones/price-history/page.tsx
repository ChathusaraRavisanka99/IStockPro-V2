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

type Props = { searchParams: { search?: string; filter?: string; from?: string; to?: string; page?: string; pageSize?: string } };

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
    ...(matchingPhoneIds ? { entityId: { in: matchingPhoneIds } } : {}),
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

      <ListControls
        search={search}
        filter={field}
        filterLabel={showWholesale ? "Retail & wholesale" : undefined}
        filterOptions={showWholesale ? (Object.keys(PRICE_FIELD_LABELS) as PriceField[]).map((value) => ({ value, label: PRICE_FIELD_LABELS[value] })) : []}
        placeholder="Search IMEI, model, variant or lot"
        showViewToggle={false}
        dateRange={{ from: fromDate, to: toDate }}
      />

      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-slate-700">
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
                          {phone.phoneVariant.phoneModel.brand} {phone.phoneVariant.phoneModel.modelName} - {phone.phoneVariant.variantName}
                          {specs ? <p className="text-xs text-slate-500">{specs}</p> : null}
                          {phone.deletedAt ? <p className="text-xs text-red-700">Archived</p> : null}
                        </>
                      ) : (
                        <span className="text-slate-500">Deleted unit</span>
                      )}
                    </td>
                    <td className="px-2 py-2 font-mono text-xs">{phone?.imei ?? "-"}</td>
                    <td className="px-2 py-2">
                      {phone && !phone.lot.deletedAt ? <Link href={`/lots/${phone.lot.id}`} className="underline">{phone.lot.lotNumber}</Link> : phone?.lot.lotNumber ?? "-"}
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
        query={{ ...(search ? { search } : {}), ...(field && showWholesale ? { filter: field } : {}), ...(fromDate ? { from: fromDate } : {}), ...(toDate ? { to: toDate } : {}) }}
      />
    </div>
  );
}
