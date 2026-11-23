import { prisma } from "@/lib/prisma";

/**
 * Extra breakdowns for the Reports page, all scoped to [from, to]: comparison with the previous
 * period of the same length, sales by customer / brand & model / staff / sale type, payments
 * received by method, and expenses by category.
 */

const unitCost = (phone: { purchasePrice: unknown; repairCost: unknown; tagCost: unknown; batteryCost: unknown }) =>
  Number(phone.purchasePrice) + Number(phone.repairCost) + Number(phone.tagCost) + Number(phone.batteryCost);

async function periodTotals(from: Date, to: Date) {
  const where = { status: "Completed" as const, saleDate: { gte: from, lte: to } };
  const [sales, items, expenses, taxes, refunds] = await Promise.all([
    prisma.sale.aggregate({ _sum: { totalAmount: true }, _count: true, where }),
    prisma.saleItem.findMany({
      where: { sale: where },
      select: { quantity: true, phone: { select: { purchasePrice: true, repairCost: true, tagCost: true, batteryCost: true } }, accessory: { select: { purchasePrice: true } } },
    }),
    prisma.expense.aggregate({ _sum: { amount: true }, where: { expenseDate: { gte: from, lte: to } } }),
    prisma.taxPayment.aggregate({ _sum: { amount: true }, where: { paidDate: { gte: from, lte: to } } }),
    prisma.returnInvoice.aggregate({ _sum: { totalCredit: true }, where: { return: { returnDate: { gte: from, lte: to } } } }),
  ]);
  const revenue = Number(sales._sum.totalAmount ?? 0);
  const cogs = items.reduce((sum, item) => sum + (item.phone ? unitCost(item.phone) : item.accessory ? Number(item.accessory.purchasePrice) * item.quantity : 0), 0);
  const gross = revenue - cogs;
  const net = gross - Number(expenses._sum.amount ?? 0) - Number(taxes._sum.amount ?? 0) - Number(refunds._sum.totalCredit ?? 0);
  return { revenue, sales: sales._count, gross, net, unitsSold: items.reduce((sum, item) => sum + item.quantity, 0) };
}

export async function computeReportExtras(from: Date, to: Date) {
  const span = Math.max(1, to.getTime() - from.getTime());
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - span);

  const saleWhere = { status: "Completed" as const, saleDate: { gte: from, lte: to } };
  const [current, previous, sales, payments, expenses, users] = await Promise.all([
    periodTotals(from, to),
    periodTotals(prevFrom, prevTo),
    prisma.sale.findMany({
      where: saleWhere,
      select: {
        id: true,
        saleType: true,
        totalAmount: true,
        createdById: true,
        customerId: true,
        customer: { select: { name: true } },
        items: {
          select: {
            quantity: true,
            lineTotal: true,
            phone: { select: { purchasePrice: true, repairCost: true, tagCost: true, batteryCost: true, phoneVariant: { select: { phoneModel: { select: { id: true, brand: true, modelName: true } } } } } },
            accessory: { select: { purchasePrice: true, category: true } },
          },
        },
      },
    }),
    prisma.payment.groupBy({ by: ["method"], _sum: { amount: true }, _count: true, where: { paidAt: { gte: from, lte: to } } }),
    prisma.expense.groupBy({ by: ["category"], _sum: { amount: true }, _count: true, where: { expenseDate: { gte: from, lte: to } } }),
    prisma.user.findMany({ select: { id: true, name: true, username: true } }),
  ]);

  const change = (now: number, before: number) => (before !== 0 ? ((now - before) / Math.abs(before)) * 100 : now !== 0 ? null : 0);
  const comparison = {
    previousFrom: prevFrom,
    previousTo: prevTo,
    revenue: { now: current.revenue, before: previous.revenue, change: change(current.revenue, previous.revenue) },
    sales: { now: current.sales, before: previous.sales, change: change(current.sales, previous.sales) },
    unitsSold: { now: current.unitsSold, before: previous.unitsSold, change: change(current.unitsSold, previous.unitsSold) },
    gross: { now: current.gross, before: previous.gross, change: change(current.gross, previous.gross) },
    net: { now: current.net, before: previous.net, change: change(current.net, previous.net) },
  };

  type Bucket = { key: string; label: string; id?: string; revenue: number; cost: number; sales: number; units: number };
  const bump = (map: Map<string, Bucket>, key: string, label: string, revenue: number, cost: number, units: number, saleId?: string, id?: string, seen?: Set<string>) => {
    const row = map.get(key) ?? { key, label, id, revenue: 0, cost: 0, sales: 0, units: 0 };
    row.revenue += revenue;
    row.cost += cost;
    row.units += units;
    if (saleId && seen && !seen.has(`${key}:${saleId}`)) {
      seen.add(`${key}:${saleId}`);
      row.sales += 1;
    }
    map.set(key, row);
  };

  const userName = new Map(users.map((user) => [user.id, user.name || user.username]));
  const byCustomer = new Map<string, Bucket>();
  const byModel = new Map<string, Bucket>();
  const byBrand = new Map<string, Bucket>();
  const byStaff = new Map<string, Bucket>();
  const byType = new Map<string, Bucket>();
  const seen = new Set<string>();
  for (const sale of sales) {
    const saleCost = sale.items.reduce((sum, item) => sum + (item.phone ? unitCost(item.phone) : item.accessory ? Number(item.accessory.purchasePrice) * item.quantity : 0), 0);
    const units = sale.items.reduce((sum, item) => sum + item.quantity, 0);
    const total = Number(sale.totalAmount);
    bump(byCustomer, sale.customerId ?? "walk-in", sale.customer?.name ?? "Walk-in customers", total, saleCost, units, sale.id, sale.customerId ?? undefined, seen);
    bump(byStaff, sale.createdById, userName.get(sale.createdById) ?? "Unknown user", total, saleCost, units, sale.id, undefined, seen);
    bump(byType, sale.saleType, sale.saleType, total, saleCost, units, sale.id, undefined, seen);
    for (const item of sale.items) {
      const lineRevenue = Number(item.lineTotal);
      if (item.phone) {
        const model = item.phone.phoneVariant.phoneModel;
        const cost = unitCost(item.phone);
        bump(byModel, model.id, `${model.brand} ${model.modelName}`, lineRevenue, cost, item.quantity, sale.id, model.id, seen);
        bump(byBrand, model.brand, model.brand, lineRevenue, cost, item.quantity, sale.id, undefined, seen);
      } else if (item.accessory) {
        const label = `Accessories · ${item.accessory.category}`;
        bump(byBrand, label, label, lineRevenue, Number(item.accessory.purchasePrice) * item.quantity, item.quantity, sale.id, undefined, seen);
      }
    }
  }
  const finish = (map: Map<string, Bucket>) =>
    Array.from(map.values())
      .map((row) => ({ ...row, profit: row.revenue - row.cost, margin: row.revenue > 0 ? ((row.revenue - row.cost) / row.revenue) * 100 : 0 }))
      .sort((a, b) => b.revenue - a.revenue);

  return {
    comparison,
    byCustomer: finish(byCustomer),
    byModel: finish(byModel),
    byBrand: finish(byBrand),
    byStaff: finish(byStaff),
    byType: finish(byType),
    payments: payments.map((row) => ({ method: row.method, amount: Number(row._sum.amount ?? 0), count: row._count })).sort((a, b) => b.amount - a.amount),
    expensesByCategory: expenses.map((row) => ({ category: row.category, amount: Number(row._sum.amount ?? 0), count: row._count })).sort((a, b) => b.amount - a.amount),
  };
}

export type ReportExtras = Awaited<ReturnType<typeof computeReportExtras>>;
