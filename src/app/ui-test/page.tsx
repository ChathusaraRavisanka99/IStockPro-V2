import { Suspense } from "react";
import { MobileNav } from "@/components/ui/mobile-nav";
import { BackNav } from "@/components/ui/back-nav";
import { PageHeader } from "@/components/ui/page-header";
import { ListControls } from "@/components/ui/list-controls";
import { Pagination } from "@/components/ui/pagination";
import { DataTableShell } from "@/components/ui/data-table-shell";
import { Card } from "@/components/ui/card";
import { PriceMissing, SpecChips, StatusPill } from "@/components/ui/spec-chips";
import { ReportBreakdowns, PeriodComparison } from "@/components/reports/report-breakdowns";
import { ExpenseMonthlyChart } from "@/components/expenses/expense-monthly-chart";
import { ReturnForm } from "@/components/sales/return-form";
import { PriceHistoryPicker } from "@/components/items/price-history-picker";
import { LotRestoreDialog } from "@/components/ui/lot-restore-dialog";
import { EntityDeleteButton } from "@/components/ui/entity-editor";
import { SaleDeleteDialog } from "@/components/sales/sale-delete-dialog";
import { UnitEditButton, UnitEditProvider } from "@/components/items/unit-edit";
import { formatMoney } from "@/lib/currency";
import { EXPENSE_OTHER_COLOR, EXPENSE_SERIES_COLORS } from "@/lib/chart-colors";
import { LONG_IMEI, LONG_NAME, LONG_PHONE, reportExtras, tableRows, topSellers } from "./fixtures";

async function noop(): Promise<{ ok: false; error: string }> {
  "use server";
  return { ok: false, error: "UI test harness — nothing is saved." };
}
async function noopVoid() {
  "use server";
}
async function noImeiOwner() {
  "use server";
  return null;
}

/** The Full-version shell (as rendered by src/app/(app)/layout.tsx) around sample content. */
export default function UiTestPage() {
  const series = EXPENSE_SERIES_COLORS.slice(0, 3).map((color, index) => ({ key: `c${index}`, label: ["Repairs", "Rent", "Transport"][index], color })).concat({ key: "other", label: "Other", color: EXPENSE_OTHER_COLOR });
  const chart = ["Sep 26", "Oct 26", "Nov 26"].map((label, index) => ({ month: label, label, total: 60000, c0: 20000 + index * 1000, c1: 20000, c2: 10000, other: 10000 - index * 1000 }));

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[280px_1fr]">
      <aside className="hidden lg:block" />
      <main className="min-w-0 p-3 sm:p-6 lg:p-8" data-testid="harness-ready">
        <MobileNav name={LONG_NAME} role="admin" />
        <div className="glass-panel rounded-2xl border border-white/90 p-3 text-slate-950 sm:rounded-3xl sm:p-6 lg:p-8">
          <Suspense fallback={null}>
            <BackNav />
          </Suspense>
          <PageHeader title={`Lot LOT-261101 · ${LONG_NAME}`} subtitle={`Supplied by ${LONG_NAME}`} help={<p>Harness</p>} />

          {/* A header action row like the lot page's (Bookmark / Edit / Delete lot + everything). */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2" data-testid="action-row">
            <span className="text-sm underline">Back to Lots</span>
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn btn-sm btn-secondary">☆ Bookmark</button>
              <button className="btn btn-sm btn-secondary">Edit details</button>
              <EntityDeleteButton label="Delete lot + everything" title="Delete?" sensitive username="demo" fields={{ id: "x" }} action={noop} consequences={["Harness"]} kept={["Harness"]} buttonClassName="btn btn-sm btn-danger" />
            </div>
          </div>

          <ListControls search="" placeholder="Search units by IMEI, model, variant or color" filterLabel="All statuses" filterOptions={[{ label: "In stock", value: "InStock" }]} />

          {/* Dashboard-style grid: a truncated long name must not widen the page. */}
          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <DataTableShell title="Sales — last 30 days" toolbar={<span className="text-sm">LKR 1,297,267.52 · 12 sales</span>}>
                <ExpenseMonthlyChart data={chart as never} series={series} />
              </DataTableShell>
            </div>
            <DataTableShell title="Top sellers">
              <ol className="grid gap-3 text-sm" data-testid="top-sellers">
                {topSellers.map((row) => (
                  <li key={row.label} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">{row.label}</span>
                    <span className="shrink-0 font-medium">{formatMoney(row.revenue)}</span>
                  </li>
                ))}
              </ol>
            </DataTableShell>
          </div>

          {/* Model cards grid (Phones page). */}
          <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {[1, 2].map((index) => (
              <Card key={index}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs uppercase text-slate-500">Apple</p>
                    <p className="truncate text-lg font-semibold">{LONG_PHONE}</p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button className="btn btn-xs btn-secondary">Edit</button>
                    <button className="btn btn-xs btn-danger">Delete</button>
                  </div>
                </div>
                <SpecChips color="Sierra Blue" storage="256GB" ram="6GB" className="mt-2 flex" />
              </Card>
            ))}
          </div>

          {/* A wide data table with long names, pills and money. */}
          <Card className="mt-4">
            <div className="overflow-x-auto" data-testid="wide-table">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-slate-500">
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2">Phone</th>
                    <th className="px-2 py-2">IMEI</th>
                    <th className="px-2 py-2">Customer</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2 text-right">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => (
                    <tr key={row.id}>
                      <td className="px-2 py-2">{row.date}</td>
                      <td className="px-2 py-2" data-testid="phone-cell">
                        {row.phone}
                        <SpecChips color="Blue" storage="128GB" className="mt-1 flex" />
                      </td>
                      <td className="px-2 py-2 font-mono text-xs">{row.imei}</td>
                      <td className="px-2 py-2">{row.customer}</td>
                      <td className="px-2 py-2">
                        <span className="flex flex-col items-start gap-1">
                          <StatusPill status="InStock" />
                          <PriceMissing retail={0} wholesale={0} />
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right">{formatMoney(row.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="mt-4">
            <PeriodComparison comparison={reportExtras.comparison} showCost />
            <ReportBreakdowns extras={reportExtras} showCost fromValue="2026-11-01" toValue="2026-11-24" />
          </div>

          <Card className="mt-4" data-testid="pickers">
            <ReturnForm action={noopVoid} />
            <div className="mt-3">
              <Suspense fallback={null}>
                <PriceHistoryPicker
                  value=""
                  label={null}
                  models={[{ id: "m1", brand: "Apple", modelName: "iPhone 13", variants: [{ id: "v1", variantName: "128GB · Blue", color: "Blue", storage: "128GB", ram: null, changes: 3 }] }]}
                />
              </Suspense>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <SaleDeleteDialog
                saleId="s1"
                saleNumber="SAL-1795485410403"
                username="demo"
                action={noop}
                blocked={null}
                consequences={["Sale SAL-1795485410403 (LKR 1,234,567.89) is permanently deleted.", "Invoice INV-1795485410403 is deleted with it."]}
                lines={[
                  { id: "l1", label: `${LONG_PHONE} - IMEI ${LONG_IMEI}`, kind: "phone", quantity: 1, amount: 385500, note: null },
                  { id: "l2", label: "USB-C fast charger 25W (SKU JK05-1224947)", kind: "accessory", quantity: 3, amount: 4500, note: null },
                ]}
              />
              <UnitEditProvider
                variants={[]}
                username="demo"
                action={noop}
                checkImei={noImeiOwner}
                lots={[
                  { id: "lot-a", label: "LOT-0001 — NADEESHA GUNAHHTILAKA", status: "Collection" },
                  { id: "lot-b", label: "LOT-0002 — Global Mobile Imports", status: "Cleared" },
                ]}
              >
                <UnitEditButton unit={{ id: "p1", imei: LONG_IMEI, phoneVariantId: "v1", lotStatus: "Collection", lotNumber: "LOT-0001", lotId: "lot-a", status: "InStock", grade: null, batteryHealth: null, notes: null }} />
              </UnitEditProvider>
            </div>
            <div className="mt-3">
              <LotRestoreDialog lotId="x" title="Lot LOT-0001" lotIssues={[]} action={noop} units={[{ id: "u1", imei: LONG_IMEI, name: LONG_PHONE, status: "Sold", soldIn: ["SAL-1788692115292"], withLot: true, blocked: null }]} />
            </div>
          </Card>

          <Pagination page={1} pageSize={25} total={120} query={{}} />
        </div>
      </main>
    </div>
  );
}
