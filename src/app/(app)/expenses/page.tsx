import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ListControls } from "@/components/ui/list-controls";
import { Pagination } from "@/components/ui/pagination";
import { parsePage, parsePageSize } from "@/lib/pagination";

export default async function ExpensesPage({ searchParams }: { searchParams: { search?: string; page?: string; pageSize?: string } }) {
  const search = searchParams.search?.trim() || "";
  const page = parsePage(searchParams.page);
  const pageSize = parsePageSize(searchParams.pageSize);
  const expenseWhere = search ? { OR: [{ category: { contains: search, mode: "insensitive" as const } }, { description: { contains: search, mode: "insensitive" as const } }] } : undefined;
  const [expenses, total] = await prisma.$transaction([prisma.expense.findMany({ where: expenseWhere, skip: (page - 1) * pageSize, take: pageSize, orderBy: { expenseDate: "desc" } }), prisma.expense.count({ where: expenseWhere })]);

  async function createExpense(formData: FormData) {
    "use server";

    const category = String(formData.get("category") || "").trim();
    const description = String(formData.get("description") || "").trim() || null;
    const amount = Number(formData.get("amount") || 0);
    const expenseDate = String(formData.get("expenseDate") || "").trim();
    const receiptUrl = String(formData.get("receiptUrl") || "").trim() || null;

    if (!category || !expenseDate) return;

    await prisma.expense.create({
      data: {
        category,
        description,
        amount,
        expenseDate: new Date(expenseDate),
        receiptUrl,
      },
    });

    revalidatePath("/expenses");
  }

  return (
    <div>
      <PageHeader title="Expenses" subtitle="Operating costs with date and category tracking" />
      <ListControls search={search} placeholder="Search expense category or description" />

      <Card className="mb-4">
        <form action={createExpense} className="grid gap-3 md:grid-cols-5">
          <input name="category" required placeholder="Category" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          <input name="description" placeholder="Description" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          <input name="amount" type="number" step="0.01" min={0} required placeholder="Amount" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          <label className="grid min-w-0 gap-1 text-sm text-slate-700">
            Expense date
            <input name="expenseDate" type="date" required className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
          </label>
          <input name="receiptUrl" placeholder="Receipt URL" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          <button className="rounded-lg bg-slate-900 px-3 py-2 text-white md:col-span-5">Add Expense</button>
        </form>
      </Card>
      <Pagination page={page} pageSize={pageSize} total={total} query={search ? { search } : {}} />

      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-slate-700">
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Category</th>
                <th className="px-2 py-2">Description</th>
                <th className="px-2 py-2">Amount</th>
                <th className="px-2 py-2">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id} className="border-b border-slate-200">
                  <td className="px-2 py-2">{expense.expenseDate.toISOString().slice(0, 10)}</td>
                  <td className="px-2 py-2">{expense.category}</td>
                  <td className="px-2 py-2">{expense.description || "-"}</td>
                  <td className="px-2 py-2">${Number(expense.amount).toFixed(2)}</td>
                  <td className="px-2 py-2">{expense.receiptUrl ? "Available" : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
