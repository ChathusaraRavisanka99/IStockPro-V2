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
import { formatPhoneName } from "@/lib/format-item-name";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { EntityDeleteButton, EntityEditButton } from "@/components/ui/entity-editor";
import { auditChange, diffFields, requireReauthWhen } from "@/lib/entity-guard";
import type { ActionResult } from "@/components/ui/editable-row";
import { EntityLink } from "@/components/ui/entity-link";

const ACCESSORY_CATEGORY_ROUTES: Record<string, string> = {
  Charger: "/items/chargers",
  Cable: "/items/cables",
  Handsfree: "/items/handsfree",
  Other: "/items/other",
};

export default async function ExpensesPage({ searchParams }: { searchParams: { search?: string; page?: string; pageSize?: string } }) {
  const session = await getServerSession(authOptions);
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

  // Category/description are non-sensitive; amount and date change the books, so editing them
  // (or deleting an expense) needs a review + password and is audit-logged.
  async function updateExpense(formData: FormData): Promise<ActionResult> {
    "use server";
    const id = String(formData.get("id") || "");
    const expense = await prisma.expense.findUnique({ where: { id } });
    if (!expense) return { ok: false, error: "Expense not found." };
    const next = {
      category: String(formData.get("category") || "").trim(),
      description: String(formData.get("description") || "").trim() || null,
      amount: Number(formData.get("amount") || 0),
      expenseDate: String(formData.get("expenseDate") || ""),
    };
    if (!next.category) return { ok: false, error: "Category is required." };
    if (!(next.amount > 0)) return { ok: false, error: "Amount must be greater than zero." };
    if (!next.expenseDate) return { ok: false, error: "Date is required." };
    const changes = diffFields({ category: expense.category, description: expense.description, amount: expense.amount, expenseDate: expense.expenseDate }, next);
    const sensitive = changes.filter((change) => change.field === "amount" || change.field === "expenseDate");
    const guard = await requireReauthWhen(formData, sensitive.length > 0);
    if (!guard.ok) return guard;
    await prisma.expense.update({ where: { id }, data: { ...next, expenseDate: new Date(next.expenseDate) } });
    if (sensitive.length) {
      const actor = await getServerSession(authOptions);
      await auditChange("SensitiveEdit", "Expense", id, actor?.user?.id, { changes });
    }
    revalidatePath("/expenses");
    return { ok: true };
  }

  async function deleteExpense(formData: FormData): Promise<ActionResult> {
    "use server";
    const guard = await requireReauthWhen(formData, true);
    if (!guard.ok) return guard;
    const id = String(formData.get("id") || "");
    const expense = await prisma.expense.findUnique({ where: { id } });
    if (!expense) return { ok: false, error: "Expense not found." };
    await prisma.expense.delete({ where: { id } });
    const actor = await getServerSession(authOptions);
    await auditChange("SensitiveDelete", "Expense", id, actor?.user?.id, { category: expense.category, amount: Number(expense.amount), date: expense.expenseDate.toISOString().slice(0, 10), phoneId: expense.phoneId, accessoryId: expense.accessoryId });
    revalidatePath("/expenses");
    revalidatePath("/reports");
    return { ok: true };
  }

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle="Operating costs with date and category tracking"
        help={
          <p>
            Record day-to-day operating costs that aren&apos;t part of a lot&apos;s landed cost — rent, utilities, repairs,
            and so on. You can optionally link an expense to a specific phone or accessory (e.g. a repair cost) and attach
            a receipt. Use the search bar to find an expense by category or description.
          </p>
        }
      />

      <Card className="mb-4">
        <form action={createExpense} className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          <label className="grid min-w-0 gap-1 text-sm text-slate-700">
            Category
            <input name="category" required placeholder="Category" className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
          </label>
          <label className="grid min-w-0 gap-1 text-sm text-slate-700">
            Description
            <input name="description" placeholder="Description" className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
          </label>
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
              options={phones.map((phone) => ({ value: phone.id, label: `${phone.imei} — ${formatPhoneName(phone.phoneVariant)}` }))}
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
          <button className="btn btn-md btn-primary md:col-span-3 xl:col-span-5">Add Expense</button>
        </form>
      </Card>

      <ListControls search={search} placeholder="Search expense category or description" showViewToggle={false} />

      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Category</th>
                <th className="px-2 py-2">Description</th>
                <th className="px-2 py-2">Amount</th>
                <th className="px-2 py-2">Linked item</th>
                <th className="px-2 py-2">Receipt</th>
                <th className="px-2 py-2">Actions</th>
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
                      <EntityLink kind="phone" id={expense.phone.id}>
                        {expense.phone.imei} ({formatPhoneName(expense.phone.phoneVariant)})
                      </EntityLink>
                    ) : expense.accessory ? (
                      <EntityLink kind="accessory" id={expense.accessory.id}>
                        {expense.accessory.name} ({expense.accessory.sku})
                      </EntityLink>
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
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      <EntityEditButton
                        title="Edit expense"
                        subtitle={`${expense.category} · ${formatMoney(Number(expense.amount))}`}
                        hidden={{ id: expense.id }}
                        action={updateExpense}
                        username={session?.user?.username}
                        fields={[
                          { name: "category", label: "Category", value: expense.category, required: true },
                          { name: "amount", label: "Amount", value: String(Number(expense.amount)), type: "number", sensitive: true, money: true, required: true },
                          { name: "expenseDate", label: "Date", value: expense.expenseDate.toISOString().slice(0, 10), type: "date", sensitive: true, required: true },
                          { name: "description", label: "Description", value: expense.description ?? "", type: "textarea" },
                        ]}
                      />
                      <EntityDeleteButton
                        title={`Delete expense "${expense.category}"?`}
                        sensitive
                        username={session?.user?.username}
                        fields={{ id: expense.id }}
                        action={deleteExpense}
                        consequences={[
                          `${formatMoney(Number(expense.amount))} is removed from expense totals and the Reports P&L for ${expense.expenseDate.toISOString().slice(0, 10)}.`,
                          expense.phone
                            ? `It stops counting toward the cost breakdown of IMEI ${expense.phone.imei}.`
                            : expense.accessory
                              ? `It stops counting toward the cost breakdown of ${expense.accessory.name}.`
                              : "It isn't linked to any item.",
                          receiptLinks[i] ? "The attached receipt is no longer reachable from the app." : "No receipt is attached.",
                          "This is permanent (expenses don't go to the Recycle Bin) and is recorded in the activity log.",
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Pagination page={page} pageSize={pageSize} total={total} query={search ? { search } : {}} />
    </div>
  );
}
