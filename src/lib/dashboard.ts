import { prisma } from "@/lib/prisma";
import { formatPhoneName } from "@/lib/format-item-name";

const DAY_MS = 86_400_000;

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function revenueBetween(from: Date, to: Date) {
  const agg = await prisma.sale.aggregate({ _sum: { totalAmount: true }, _count: true, where: { status: "Completed", saleDate: { gte: from, lt: to } } });
  return { revenue: Number(agg._sum.totalAmount ?? 0), count: agg._count };
}

/** Cost of goods for completed sales in [from, to), same rules as src/lib/reports.ts. */
async function cogsByDay(from: Date, to: Date) {
  const rows = await prisma.$queryRaw<{ day: Date; cogs: number }[]>`
    SELECT date_trunc('day', s."saleDate") AS day,
      SUM(
        CASE
          WHEN si."phoneId" IS NOT NULL THEN COALESCE(p."purchasePrice", 0) + COALESCE(p."repairCost", 0) + COALESCE(p."tagCost", 0) + COALESCE(p."batteryCost", 0)
          WHEN si."accessoryId" IS NOT NULL THEN COALESCE(a."purchasePrice", 0) * si."quantity"
          ELSE 0
        END
      )::float AS cogs
    FROM "SaleItem" si
    JOIN "Sale" s ON s.id = si."saleId"
    LEFT JOIN "Phone" p ON p.id = si."phoneId"
    LEFT JOIN "Accessory" a ON a.id = si."accessoryId"
    WHERE s.status = 'Completed' AND s."saleDate" >= ${from} AND s."saleDate" < ${to}
    GROUP BY day
  `;
  return new Map(rows.map((row) => [dayKey(row.day), Number(row.cogs)]));
}

/** Percent change, or null when there's no baseline to compare against. */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

export async function getDashboardInsights(now = new Date()) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  // Same number of elapsed days last month, so a half-finished month compares fairly.
  const prevMonthSamePoint = new Date(Math.min(prevMonthStart.getTime() + (now.getTime() - monthStart.getTime()), monthStart.getTime()));
  const trendStart = new Date(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - 29 * DAY_MS);
  const tomorrow = new Date(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() + DAY_MS);

  const [thisMonth, lastMonthToDate, dailyRevenueRows, trendCogs, monthCogs, prevCogs, recentSales, recentItems, retailValue] = await Promise.all([
    revenueBetween(monthStart, tomorrow),
    revenueBetween(prevMonthStart, prevMonthSamePoint),
    prisma.$queryRaw<{ day: Date; revenue: number; sales: number }[]>`
      SELECT date_trunc('day', "saleDate") AS day, SUM("totalAmount")::float AS revenue, COUNT(*)::int AS sales
      FROM "Sale"
      WHERE status = 'Completed' AND "saleDate" >= ${trendStart} AND "saleDate" < ${tomorrow}
      GROUP BY day
    `,
    cogsByDay(trendStart, tomorrow),
    cogsByDay(monthStart, tomorrow),
    cogsByDay(prevMonthStart, prevMonthSamePoint),
    prisma.sale.findMany({
      where: { status: "Completed" },
      orderBy: { saleDate: "desc" },
      take: 6,
      select: { id: true, saleNumber: true, saleDate: true, totalAmount: true, saleType: true, customer: { select: { name: true } }, _count: { select: { items: true } } },
    }),
    prisma.saleItem.findMany({
      where: { sale: { status: "Completed", saleDate: { gte: trendStart } } },
      select: { quantity: true, lineTotal: true, accessory: { select: { id: true, name: true } }, phone: { select: { phoneVariantId: true, phoneVariant: { include: { phoneModel: true } } } } },
    }),
    prisma.phone.aggregate({ _sum: { retailPrice: true }, where: { deletedAt: null, status: "InStock" } }),
  ]);

  const revenueByDay = new Map(dailyRevenueRows.map((row) => [dayKey(row.day), { revenue: Number(row.revenue), sales: Number(row.sales) }]));
  const trend = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(trendStart.getTime() + index * DAY_MS);
    const key = dayKey(date);
    const revenue = revenueByDay.get(key)?.revenue ?? 0;
    return {
      date: key,
      label: date.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      revenue,
      profit: revenue - (trendCogs.get(key) ?? 0),
      sales: revenueByDay.get(key)?.sales ?? 0,
    };
  });

  const sumMap = (map: Map<string, number>) => Array.from(map.values()).reduce((sum, value) => sum + value, 0);
  const monthProfit = thisMonth.revenue - sumMap(monthCogs);
  const prevProfit = lastMonthToDate.revenue - sumMap(prevCogs);

  const sellers = new Map<string, { label: string; qty: number; revenue: number }>();
  for (const item of recentItems) {
    const key = item.phone ? `p:${item.phone.phoneVariantId}` : item.accessory ? `a:${item.accessory.id}` : null;
    if (!key) continue;
    const label = item.phone ? formatPhoneName(item.phone.phoneVariant) : item.accessory!.name;
    const entry = sellers.get(key) ?? { label, qty: 0, revenue: 0 };
    entry.qty += item.quantity;
    entry.revenue += Number(item.lineTotal);
    sellers.set(key, entry);
  }
  const topSellers = Array.from(sellers.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 6);

  return {
    month: {
      revenue: thisMonth.revenue,
      revenueChange: percentChange(thisMonth.revenue, lastMonthToDate.revenue),
      sales: thisMonth.count,
      salesChange: percentChange(thisMonth.count, lastMonthToDate.count),
      profit: monthProfit,
      profitChange: percentChange(monthProfit, prevProfit),
      margin: thisMonth.revenue > 0 ? (monthProfit / thisMonth.revenue) * 100 : null,
      avgSale: thisMonth.count ? thisMonth.revenue / thisMonth.count : 0,
    },
    trend,
    trendTotals: { revenue: trend.reduce((sum, day) => sum + day.revenue, 0), sales: trend.reduce((sum, day) => sum + day.sales, 0) },
    topSellers,
    recentSales: recentSales.map((sale) => ({
      id: sale.id,
      saleNumber: sale.saleNumber,
      date: sale.saleDate.toISOString(),
      total: Number(sale.totalAmount),
      saleType: sale.saleType,
      customer: sale.customer?.name ?? "Walk-in",
      items: sale._count.items,
    })),
    stockRetailValue: Number(retailValue._sum.retailPrice ?? 0),
  };
}

export type DashboardInsights = Awaited<ReturnType<typeof getDashboardInsights>>;
