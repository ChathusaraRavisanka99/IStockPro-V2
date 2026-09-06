import { prisma } from "@/lib/prisma";

const AGING_DAYS = 60;

export async function computeReportData(from: Date, to: Date) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const agingCutoff = new Date(now.getTime() - AGING_DAYS * 24 * 60 * 60 * 1000);
  const periodSaleWhere = { status: "Completed" as const, saleDate: { gte: from, lte: to } };

  const [
    salesAgg,
    salesThisMonthAgg,
    salesLastMonthAgg,
    quotationsAgg,
    periodSaleItems,
    expensesAgg,
    taxesAgg,
    creditNotesAgg,
    returnCountInPeriod,
    unpaidInvoices,
    inStockPhones,
    accessories,
    phoneModels,
    lots,
    agingPhones,
  ] = await Promise.all([
    prisma.sale.aggregate({ _sum: { totalAmount: true }, _count: true, where: periodSaleWhere }),
    prisma.sale.aggregate({ _sum: { totalAmount: true }, _count: true, where: { status: "Completed", saleDate: { gte: monthStart } } }),
    prisma.sale.aggregate({ _sum: { totalAmount: true }, _count: true, where: { status: "Completed", saleDate: { gte: lastMonthStart, lt: monthStart } } }),
    prisma.quotation.aggregate({ _sum: { totalAmount: true }, _count: true, where: { quoteDate: { gte: from, lte: to } } }),
    prisma.saleItem.findMany({
      where: { sale: periodSaleWhere },
      select: {
        quantity: true,
        lineTotal: true,
        phone: { select: { phoneVariantId: true, purchasePrice: true, repairCost: true, tagCost: true, batteryCost: true, phoneVariant: { select: { variantName: true, phoneModel: { select: { brand: true, modelName: true } } } } } },
        accessory: { select: { id: true, name: true, sku: true, purchasePrice: true } },
      },
    }),
    prisma.expense.aggregate({ _sum: { amount: true }, where: { expenseDate: { gte: from, lte: to } } }),
    prisma.taxPayment.aggregate({ _sum: { amount: true }, where: { paidDate: { gte: from, lte: to } } }),
    prisma.returnInvoice.aggregate({ _sum: { totalCredit: true }, where: { return: { returnDate: { gte: from, lte: to } } } }),
    prisma.return.count({ where: { returnDate: { gte: from, lte: to } } }),
    prisma.invoice.findMany({ where: { status: { in: ["Unpaid", "PartiallyPaid"] } }, select: { totalAmount: true, paidAmount: true } }),
    prisma.phone.findMany({ where: { status: "InStock", deletedAt: null }, select: { purchasePrice: true, retailPrice: true } }),
    prisma.accessory.findMany({ where: { deletedAt: null } }),
    prisma.phoneModel.findMany({ where: { deletedAt: null }, include: { variants: { where: { deletedAt: null }, include: { _count: { select: { phones: { where: { status: "InStock", deletedAt: null } } } } } } } }),
    prisma.lot.findMany({ where: { deletedAt: null }, include: { phones: { where: { deletedAt: null }, select: { purchasePrice: true } } } }),
    prisma.phone.findMany({ where: { status: "InStock", deletedAt: null, createdAt: { lt: agingCutoff } }, include: { phoneVariant: { include: { phoneModel: true } } }, orderBy: { createdAt: "asc" } }),
  ]);

  // ---- Financials (scoped to the selected period) ----
  const revenue = Number(salesAgg._sum.totalAmount ?? 0);
  const completedSaleCount = salesAgg._count;
  const quotationTotals = Number(quotationsAgg._sum.totalAmount ?? 0);
  const quotationCount = quotationsAgg._count;

  const phoneCogs = periodSaleItems.reduce((sum, item) => (item.phone ? sum + Number(item.phone.purchasePrice) + Number(item.phone.repairCost) + Number(item.phone.tagCost) + Number(item.phone.batteryCost) : sum), 0);
  const accessoryCogs = periodSaleItems.reduce((sum, item) => (item.accessory ? sum + Number(item.accessory.purchasePrice) * item.quantity : sum), 0);
  const cogs = phoneCogs + accessoryCogs;
  const grossProfit = revenue - cogs;
  const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

  const expenses = Number(expensesAgg._sum.amount ?? 0);
  const taxes = Number(taxesAgg._sum.amount ?? 0);
  const refunds = Number(creditNotesAgg._sum.totalCredit ?? 0);
  const otherExpenses = expenses + taxes;
  const netProfit = grossProfit - otherExpenses - refunds;
  const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  const avgSaleValue = completedSaleCount > 0 ? revenue / completedSaleCount : 0;
  const returnRate = completedSaleCount > 0 ? (returnCountInPeriod / completedSaleCount) * 100 : 0;

  const monthRevenue = Number(salesThisMonthAgg._sum.totalAmount ?? 0);
  const lastMonthRevenue = Number(salesLastMonthAgg._sum.totalAmount ?? 0);
  const monthOverMonth = lastMonthRevenue > 0 ? ((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : monthRevenue > 0 ? 100 : 0;

  // ---- Snapshot metrics (not date-scoped — current state, not period activity) ----
  const accountsReceivable = unpaidInvoices.reduce((sum, invoice) => sum + (Number(invoice.totalAmount) - Number(invoice.paidAmount)), 0);
  const lotsWithCost = lots.map((lot) => {
    const unitsCost = lot.phones.reduce((sum, phone) => sum + Number(phone.purchasePrice), 0);
    // Same goodsCost-or-unitsCost fallback used on the Lot detail page: a lot with a
    // recorded lump-sum goods cost is tracked against that immediately; older lots
    // (goodsCost = 0) fall back to summing whatever units have been itemized so far.
    const goodsCostBasis = Number(lot.goodsCost) > 0 ? Number(lot.goodsCost) : unitsCost;
    const totalCost = Number(lot.shippingCost) + Number(lot.taxCost) + Number(lot.customsCost) + Number(lot.otherCost) + goodsCostBasis;
    return { ...lot, totalCost, remaining: Math.max(0, totalCost - Number(lot.amountPaid)) };
  });
  const accountsPayable = lotsWithCost.reduce((sum, lot) => sum + lot.remaining, 0);

  const phoneInventoryCost = inStockPhones.reduce((sum, phone) => sum + Number(phone.purchasePrice), 0);
  const phoneInventoryRetail = inStockPhones.reduce((sum, phone) => sum + Number(phone.retailPrice ?? 0), 0);
  const accessoryInventoryCost = accessories.reduce((sum, item) => sum + Number(item.purchasePrice) * item.quantity, 0);
  const accessoryInventoryRetail = accessories.reduce((sum, item) => sum + Number(item.retailPrice) * item.quantity, 0);
  const totalInventoryCost = phoneInventoryCost + accessoryInventoryCost;
  const totalInventoryRetail = phoneInventoryRetail + accessoryInventoryRetail;

  const accessoryCategories = Array.from(new Set(accessories.map((item) => item.category)));
  const inventoryByCategory = [
    { category: "Phones", units: inStockPhones.length, cost: phoneInventoryCost, retail: phoneInventoryRetail },
    ...accessoryCategories.map((cat) => {
      const items = accessories.filter((item) => item.category === cat);
      return {
        category: cat,
        units: items.reduce((sum, item) => sum + item.quantity, 0),
        cost: items.reduce((sum, item) => sum + Number(item.purchasePrice) * item.quantity, 0),
        retail: items.reduce((sum, item) => sum + Number(item.retailPrice) * item.quantity, 0),
      };
    }),
  ];

  const lowStockModels = phoneModels
    .map((model) => ({ label: `${model.brand} ${model.modelName}`, inStock: model.variants.reduce((sum, variant) => sum + variant._count.phones, 0), threshold: model.lowStockThreshold }))
    .filter((model) => model.inStock < model.threshold);
  const lowStockAccessories = accessories.filter((item) => item.quantity < item.lowStockThreshold).map((item) => ({ label: `${item.name} (${item.sku})`, inStock: item.quantity, threshold: item.lowStockThreshold }));
  const lowStockItems = [...lowStockModels, ...lowStockAccessories];

  // ---- Sales by item (scoped to the selected period) ----
  const sellerMap = new Map<string, { label: string; qty: number; revenue: number }>();
  for (const item of periodSaleItems) {
    const key = item.phone ? `phone:${item.phone.phoneVariantId}` : item.accessory ? `accessory:${item.accessory.id}` : null;
    if (!key) continue;
    const label = item.phone
      ? `${item.phone.phoneVariant.phoneModel.brand} ${item.phone.phoneVariant.phoneModel.modelName} - ${item.phone.phoneVariant.variantName}`
      : `${item.accessory!.name} (${item.accessory!.sku})`;
    const entry = sellerMap.get(key) ?? { label, qty: 0, revenue: 0 };
    entry.qty += item.quantity;
    entry.revenue += Number(item.lineTotal);
    sellerMap.set(key, entry);
  }
  const salesByItem = Array.from(sellerMap.values()).sort((a, b) => b.qty - a.qty);

  // ---- Daily revenue/profit trend (scoped to the selected period) ----
  const dailyRevenueRows = await prisma.$queryRaw<{ day: Date; revenue: number }[]>`
    SELECT date_trunc('day', "saleDate") AS day, SUM("totalAmount")::float AS revenue
    FROM "Sale"
    WHERE status = 'Completed' AND "saleDate" BETWEEN ${from} AND ${to}
    GROUP BY day
    ORDER BY day ASC
  `;
  const dailyCogsRows = await prisma.$queryRaw<{ day: Date; cogs: number }[]>`
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
    WHERE s.status = 'Completed' AND s."saleDate" BETWEEN ${from} AND ${to}
    GROUP BY day
    ORDER BY day ASC
  `;
  const cogsByDay = new Map(dailyCogsRows.map((row) => [row.day.toISOString().slice(0, 10), Number(row.cogs)]));
  const dailyRevenue = dailyRevenueRows.map((row) => {
    const date = row.day.toISOString().slice(0, 10);
    const dayRevenue = Number(row.revenue);
    return { date, revenue: dayRevenue, profit: dayRevenue - (cogsByDay.get(date) ?? 0) };
  });

  return {
    period: { from, to },
    financial: {
      revenue,
      completedSaleCount,
      avgSaleValue,
      quotationTotals,
      quotationCount,
      cogs,
      phoneCogs,
      accessoryCogs,
      grossProfit,
      grossMargin,
      expenses,
      taxes,
      otherExpenses,
      refunds,
      returnCountInPeriod,
      returnRate,
      netProfit,
      netMargin,
      monthRevenue,
      lastMonthRevenue,
      monthOverMonth,
      accountsReceivable,
      accountsPayable,
      unpaidInvoiceCount: unpaidInvoices.length,
      lotsOwedCount: lotsWithCost.filter((lot) => lot.remaining > 0).length,
    },
    inventory: {
      totalInventoryCost,
      totalInventoryRetail,
      inventoryByCategory,
      lowStockItems,
      agingCount: agingPhones.length,
      agingDays: AGING_DAYS,
      agingPhones: agingPhones.map((phone) => ({
        label: `${phone.phoneVariant.phoneModel.brand} ${phone.phoneVariant.phoneModel.modelName} - ${phone.imei}`,
        days: Math.floor((now.getTime() - phone.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
      })),
    },
    salesByItem,
    dailyRevenue,
  };
}

export type ReportData = Awaited<ReturnType<typeof computeReportData>>;
