import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { InfoHelp } from "@/components/ui/info-help";
import { EntityLink } from "@/components/ui/entity-link";
import { formatMoney } from "@/lib/currency";
import { formatPhoneName } from "@/lib/format-item-name";
import { ExpenseMonthlyChart } from "@/components/expenses/expense-monthly-chart";
import { EXPENSE_OTHER_COLOR, EXPENSE_SERIES_COLORS } from "@/lib/chart-colors";

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" });
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

function parseDay(value: string | undefined, fallback: Date) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

/** Expense analytics for a date range (default: the last 12 months). */
export async function ExpenseStats({ from: fromParam, to: toParam }: { from?: string; to?: string }) {
  const now = new Date();
  const from = parseDay(fromParam, new Date(now.getFullYear(), now.getMonth() - 11, 1));
  const toDay = parseDay(toParam, now);
  const to = new Date(toDay.getFullYear(), toDay.getMonth(), toDay.getDate(), 23, 59, 59, 999);

  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthSameDay = new Date(now.getFullYear(), now.getMonth() - 1, Math.min(now.getDate(), new Date(now.getFullYear(), now.getMonth(), 0).getDate()), 23, 59, 59);

  const [expenses, thisMonth, lastMonthToDate] = await Promise.all([
    prisma.expense.findMany({
      where: { expenseDate: { gte: from, lte: to } },
      orderBy: { expenseDate: "asc" },
      select: {
        id: true,
        category: true,
        description: true,
        amount: true,
        expenseDate: true,
        phoneId: true,
        accessoryId: true,
        phone: { select: { imei: true, phoneVariant: { include: { phoneModel: true } } } },
        accessory: { select: { name: true } },
      },
    }),
    prisma.expense.aggregate({ _sum: { amount: true }, where: { expenseDate: { gte: thisMonthStart, lte: now } } }),
    prisma.expense.aggregate({ _sum: { amount: true }, where: { expenseDate: { gte: lastMonthStart, lte: lastMonthSameDay } } }),
  ]);

  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const thisMonthTotal = Number(thisMonth._sum.amount ?? 0);
  const lastMonthTotal = Number(lastMonthToDate._sum.amount ?? 0);
  const monthChange = lastMonthTotal > 0 ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100 : null;
  const linked = expenses.filter((expense) => expense.phoneId || expense.accessoryId);
  const linkedTotal = linked.reduce((sum, expense) => sum + Number(expense.amount), 0);

  // Months in range (including empty ones, so gaps show).
  const months: { key: string; label: string }[] = [];
  for (let cursor = new Date(from.getFullYear(), from.getMonth(), 1); cursor <= to; cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)) {
    months.push({ key: monthKey(cursor), label: MONTH.format(cursor) });
    if (months.length > 60) break;
  }
  const avgPerMonth = months.length ? total / months.length : 0;

  // Categories: top 5 get their own color, the rest fold into "Other".
  const byCategory = new Map<string, { total: number; count: number }>();
  for (const expense of expenses) {
    const row = byCategory.get(expense.category) ?? { total: 0, count: 0 };
    row.total += Number(expense.amount);
    row.count += 1;
    byCategory.set(expense.category, row);
  }
  const categories = Array.from(byCategory.entries()).map(([name, row]) => ({ name, ...row })).sort((a, b) => b.total - a.total);
  const topCategories = categories.slice(0, 5).map((category) => category.name);
  const hasOther = categories.length > 5;
  const series = [
    ...topCategories.map((name, index) => ({ key: `c${index}`, label: name, color: EXPENSE_SERIES_COLORS[index] })),
    ...(hasOther ? [{ key: "other", label: "Other", color: EXPENSE_OTHER_COLOR }] : []),
  ];
  const colorOf = (name: string) => {
    const index = topCategories.indexOf(name);
    return index >= 0 ? EXPENSE_SERIES_COLORS[index] : EXPENSE_OTHER_COLOR;
  };
  const chartRows = months.map((month) => {
    const row: Record<string, number | string> = { month: month.key, label: month.label, total: 0 };
    for (const item of series) row[item.key] = 0;
    return row;
  });
  const rowByMonth = new Map(chartRows.map((row) => [row.month as string, row]));
  for (const expense of expenses) {
    const row = rowByMonth.get(monthKey(expense.expenseDate));
    if (!row) continue;
    const index = topCategories.indexOf(expense.category);
    const key = index >= 0 ? `c${index}` : "other";
    row[key] = Number(row[key]) + Number(expense.amount);
    row.total = Number(row.total) + Number(expense.amount);
  }

  // Items that cost the most to prepare / maintain.
  const byItem = new Map<string, { kind: "phone" | "accessory"; id: string; label: string; total: number; count: number }>();
  for (const expense of linked) {
    const kind = expense.phoneId ? "phone" : "accessory";
    const id = (expense.phoneId ?? expense.accessoryId) as string;
    const label = expense.phone ? `${formatPhoneName(expense.phone.phoneVariant)} · ${expense.phone.imei}` : expense.accessory?.name ?? "Item";
    const row = byItem.get(id) ?? { kind, id, label, total: 0, count: 0 };
    row.total += Number(expense.amount);
    row.count += 1;
    byItem.set(id, row);
  }
  const topItems = Array.from(byItem.values()).sort((a, b) => b.total - a.total).slice(0, 8);
  const largest = [...expenses].sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 8);
  const categoryMax = Math.max(1, ...categories.map((category) => category.total));

  const fromValue = from.toISOString().slice(0, 10);
  const toValue = `${toDay.getFullYear()}-${String(toDay.getMonth() + 1).padStart(2, "0")}-${String(toDay.getDate()).padStart(2, "0")}`;

  return (
    <div className="grid gap-4">
      <Card>
        <form className="flex flex-wrap items-end gap-3 text-sm">
          <input type="hidden" name="view" value="stats" />
          <label className="grid gap-1 text-xs font-medium text-slate-600">
            From
            <input type="date" name="from" defaultValue={fromValue} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
          </label>
          <label className="grid gap-1 text-xs font-medium text-slate-600">
            To
            <input type="date" name="to" defaultValue={toValue} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
          </label>
          <button className="btn btn-md btn-primary">Apply</button>
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: "This month", from: monthKey(now) + "-01" },
              { label: "3 months", from: monthKey(new Date(now.getFullYear(), now.getMonth() - 2, 1)) + "-01" },
              { label: "12 months", from: monthKey(new Date(now.getFullYear(), now.getMonth() - 11, 1)) + "-01" },
              { label: "This year", from: `${now.getFullYear()}-01-01` },
            ].map((preset) => (
              <Link key={preset.label} href={`/expenses?view=stats&from=${preset.from}`} className={`btn btn-sm ${preset.from === fromValue && !toParam ? "btn-primary" : "btn-secondary"}`}>
                {preset.label}
              </Link>
            ))}
          </div>
        </form>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total in period</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatMoney(total)}</p>
          <p className="text-sm text-slate-600">{expenses.length} expense{expenses.length === 1 ? "" : "s"}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">This month</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatMoney(thisMonthTotal)}</p>
          <p className="text-sm text-slate-600">
            {monthChange === null ? "Nothing same time last month" : `${monthChange >= 0 ? "▲" : "▼"} ${Math.abs(monthChange).toFixed(0)}% vs same days last month`}
          </p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Average per month</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatMoney(avgPerMonth)}</p>
          <p className="text-sm text-slate-600">over {months.length} month{months.length === 1 ? "" : "s"}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Spent on items</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatMoney(linkedTotal)}</p>
          <p className="text-sm text-slate-600">{total > 0 ? `${((linkedTotal / total) * 100).toFixed(0)}% of spend is tied to a phone/accessory` : "No spend yet"}</p>
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 flex items-center gap-1.5 text-lg font-semibold">
          Expenses by month
          <InfoHelp size="sm" title="Expenses by month">Each bar is one month, split by category (the five biggest categories in the period get their own color; the rest are grouped as Other). Hover a bar for the breakdown.</InfoHelp>
        </h2>
        <ExpenseMonthlyChart data={chartRows as never} series={series} />
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="min-w-0">
          <h2 className="mb-3 text-lg font-semibold">By category</h2>
          {categories.length ? (
            <ul className="grid gap-2.5 text-sm">
              {categories.map((category) => (
                <li key={category.name}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-1.5 truncate text-slate-800">
                      <span className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: colorOf(category.name) }} />
                      <Link href={`/expenses?search=${encodeURIComponent(category.name)}`} className="truncate hover:underline">{category.name}</Link>
                    </span>
                    <span className="shrink-0 text-xs text-slate-600">
                      <span className="font-semibold text-slate-900">{formatMoney(category.total)}</span> · {total > 0 ? ((category.total / total) * 100).toFixed(0) : 0}% · {category.count}×
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${(category.total / categoryMax) * 100}%`, background: colorOf(category.name) }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No expenses in this period.</p>
          )}
        </Card>

        <Card className="min-w-0">
          <h2 className="mb-3 flex items-center gap-1.5 text-lg font-semibold">
            Items with the most spend
            <InfoHelp size="sm" title="Items with the most spend">Phones and accessories with the most expenses linked to them in this period (repairs, parts, tags…). Click one for its details.</InfoHelp>
          </h2>
          {topItems.length ? (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">Item</th>
                  <th className="px-2 py-2 text-right">Expenses</th>
                  <th className="px-2 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {topItems.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100">
                    <td className="px-2 py-2"><EntityLink kind={item.kind} id={item.id}>{item.label}</EntityLink></td>
                    <td className="px-2 py-2 text-right">{item.count}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-medium">{formatMoney(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-slate-500">No expenses were linked to a phone or accessory in this period.</p>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Largest expenses</h2>
        {largest.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">Date</th>
                  <th className="px-2 py-2">Category</th>
                  <th className="px-2 py-2">Description</th>
                  <th className="px-2 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {largest.map((expense) => (
                  <tr key={expense.id} className="border-b border-slate-100">
                    <td className="whitespace-nowrap px-2 py-2">{expense.expenseDate.toISOString().slice(0, 10)}</td>
                    <td className="px-2 py-2">{expense.category}</td>
                    <td className="px-2 py-2 text-slate-700">{expense.description || "—"}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right font-medium">{formatMoney(expense.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">No expenses in this period.</p>
        )}
      </Card>
    </div>
  );
}
