import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as XLSX from "xlsx";
import { authOptions } from "@/lib/auth";
import { canViewCost } from "@/lib/rbac";
import { computeReportData } from "@/lib/reports";

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.error || !canViewCost(session.user.role as "admin" | "manager" | "staff" | undefined)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const from = fromParam ? new Date(`${fromParam}T00:00:00`) : monthStart;
  const to = toParam ? new Date(`${toParam}T23:59:59.999`) : now;

  const data = await computeReportData(from, to);
  const { financial: f, inventory: inv, salesByItem } = data;

  const summarySheet = XLSX.utils.aoa_to_sheet([
    ["IStockPro Financial Report"],
    ["Period", `${toDateInputValue(from)} to ${toDateInputValue(to)}`],
    [],
    ["Income Statement"],
    ["Total Revenue", f.revenue],
    ["Cost of Goods Sold", -f.cogs],
    ["Gross Profit", f.grossProfit],
    ["Returns", -f.refunds, `${f.returnCountInPeriod} returns`],
    ["Other Expenses (opex + tax)", -f.otherExpenses],
    ["Net Income", f.netProfit],
    [],
    ["Other Metrics"],
    ["Quotation Totals", f.quotationTotals, `${f.quotationCount} quotations`],
    ["Completed Sales", f.completedSaleCount],
    ["Average Sale Value", f.avgSaleValue],
    ["Accounts Receivable", f.accountsReceivable],
    ["Accounts Payable", f.accountsPayable],
    ["Inventory at Cost", inv.totalInventoryCost],
    ["Inventory at Retail", inv.totalInventoryRetail],
    ["Aging Stock (60+ days)", inv.agingCount],
  ]);

  const salesByItemSheet = XLSX.utils.json_to_sheet(
    salesByItem.map((row) => ({ Item: row.label, "Quantity Sold": row.qty, "Total Sales": Number(row.revenue.toFixed(2)) })),
  );

  const inventorySheet = XLSX.utils.json_to_sheet(
    inv.inventoryByCategory.map((row) => ({ Category: row.category, Units: row.units, "Cost Value": Number(row.cost.toFixed(2)), "Retail Value": Number(row.retail.toFixed(2)) })),
  );

  const lowStockSheet = XLSX.utils.json_to_sheet(
    inv.lowStockItems.map((row) => ({ Item: row.label, "In Stock": row.inStock, Threshold: row.threshold })),
  );

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
  XLSX.utils.book_append_sheet(workbook, salesByItemSheet, "Sales by Item");
  XLSX.utils.book_append_sheet(workbook, inventorySheet, "Inventory by Category");
  XLSX.utils.book_append_sheet(workbook, lowStockSheet, "Low Stock");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="istockpro-report-${toDateInputValue(from)}-to-${toDateInputValue(to)}.xlsx"`,
    },
  });
}
