import { revalidatePath } from "next/cache";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ListControls } from "@/components/ui/list-controls";
import { Pagination } from "@/components/ui/pagination";
import { parsePage, parsePageSize } from "@/lib/pagination";
import { formatMoney } from "@/lib/currency";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { uploadFile, getSignedDownloadUrl, isStorageKey, buildKey } from "@/lib/storage";

const ACCESSORY_CATEGORY_ROUTES: Record<string, string> = {
  Charger: "/items/chargers",
  Cable: "/items/cables",
  Handsfree: "/items/handsfree",
  Other: "/items/other",
};

export default async function ExpensesPage({ searchParams }: { searchParams: { search?: string; page?: string; pageSize?: string } }) {
  const search = searchParams.search?.trim() || "";
  const page = parsePage(searchParams.page);
  const pageSize = parsePageSize(searchParams.pageSize);
  const expenseWhere = search ? { OR: [{ category: { contains: search, mode: "insensitive" as const } }, { description: { contains: search, mode: "insensitive" as const } }] } : undefined;
  const [expenses, total, phones, accessories] = await prisma.$transaction([
    prisma.expense.findMany({
      where: expenseWhere,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { expenseDate: "desc" },
      include: { phone: { include: { phoneVariant: { include: { phoneModel: true } } } }, accessory: true },
    }),
    prisma.expense.count({ where: expenseWhere }),
    prisma.phone.findMany({ where: { deletedAt: null }, include: { phoneVariant: { include: { phoneModel: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.accessory.findMany({ where: { deletedAt: null }, orderBy: [{ category: "asc" }, { name: "asc" }] }),
  ]);

  const receiptLinks = await Promise.all(
    expenses.map((expense) => (expense.receiptUrl ? (isStorageKey(expense.receiptUrl) ? getSignedDownloadUrl(expense.receiptUrl) : expense.receiptUrl) : null))
  );

  async function createExpense(formData: FormData) {
    "use server";

    const category = String(formData.get("category") || "").trim();
    const description = String(formData.get("description") || "").trim() || null;
    const amount = Number(formData.get("amount") || 0);
    const expenseDate = String(formData.get("expenseDate") || "").trim();
    const phoneId = String(formData.get("phoneId") || "").trim() || null;
    const accessoryId = String(formData.get("accessoryId") || "").trim() || null;

    if (!category || !expenseDate) return;

    let receiptUrl: string | null = null;
    const receiptFile = formData.get("receiptFile");
    if (receiptFile instanceof File && receiptFile.size > 0) {
      const key = buildKey("expenses", receiptFile.name);
      await uploadFile(Buffer.from(await receiptFile.arrayBuffer()), key, receiptFile.type || "application/octet-stream");
      receiptUrl = key;
    }

    await prisma.expense.create({
      data: {
        category,
        description,
        amount,
        expenseDate: new Date(expenseDate),
        receiptUrl,
        phoneId,
        accessoryId,
      },
    });

    revalidatePath("/expenses");
  }

  return (
    <div>
      <PageHeader title="Expenses" subtitle="Operating costs with date and category tracking" />
      <ListControls search={search} placeholder="Search expense category or description" showViewToggle={false} />

      <Card className="mb-4">
        <form action={createExpense} className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          <input name="category" required placeholder="Category" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          <input name="description" placeholder="Description" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          <label className="grid min-w-0 gap-1 text-sm text-slate-700">
            Amount
            <input name="amount" type="number" step="0.01" min={0} required placeholder="Amount" className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
          </label>
          <label className="grid min-w-0 gap-1 text-sm text-slate-700">
            Expense date
            <input name="expenseDate" type="date" required className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
          </label>
          <label className="grid min-w-0 gap-1 text-sm text-slate-700">
            Link to phone (optional)
            <SearchableSelect
              name="phoneId"
              placeholder="Select a phone by IMEI"
              options={phones.map((phone) => ({ value: phone.id, label: `${phone.imei} — ${phone.phoneVariant.phoneModel.brand} ${phone.phoneVariant.phoneModel.modelName}` }))}
            />
          </label>
          <label className="grid min-w-0 gap-1 text-sm text-slate-700">
            Link to item (optional)
            <SearchableSelect
              name="accessoryId"
              placeholder="Select an accessory"
              options={accessories.map((item) => ({ value: item.id, label: `${item.name} (${item.sku})` }))}
            />
          </label>
          <label className="grid min-w-0 gap-1 text-sm text-slate-700">
            Receipt (optional)
            <input name="receiptFile" type="file" accept="image/*,application/pdf" className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
          </label>
          <button className="rounded-lg bg-slate-900 px-3 py-2 text-white md:col-span-3 xl:col-span-5">Add Expense</button>
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
                <th className="px-2 py-2">Linked item</th>
                <th className="px-2 py-2">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense, i) => (
                <tr key={expense.id} className="border-b border-slate-200">
                  <td className="px-2 py-2">{expense.expenseDate.toISOString().slice(0, 10)}</td>
                  <td className="px-2 py-2">{expense.category}</td>
                  <td className="px-2 py-2">{expense.description || "-"}</td>
                  <td className="px-2 py-2">{formatMoney(Number(expense.amount))}</td>
                  <td className="px-2 py-2">
                    {expense.phone ? (
                      <Link href={`/lots/${expense.phone.lotId}`} className="text-slate-800 underline">
                        {expense.phone.imei} ({expense.phone.phoneVariant.phoneModel.brand} {expense.phone.phoneVariant.phoneModel.modelName})
                      </Link>
                    ) : expense.accessory ? (
                      <Link href={ACCESSORY_CATEGORY_ROUTES[expense.accessory.category] || "/items/other"} className="text-slate-800 underline">
                        {expense.accessory.name} ({expense.accessory.sku})
                      </Link>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {receiptLinks[i] ? (
                      <a href={receiptLinks[i] as string} target="_blank" rel="noreferrer" className="text-slate-800 underline">View</a>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
