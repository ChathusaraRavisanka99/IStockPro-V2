import { prisma } from "@/lib/prisma";
import { buildKey, uploadFile } from "@/lib/storage";

export type UnitExpenseRow = { id: string; category: string; description: string | null; amount: number; date: string; hasReceipt: boolean };

const SUGGESTED = ["Repair", "Screen replacement", "Battery replacement", "Parts", "Back glass", "Charging port", "Cleaning & refurbishing", "Software / unlocking", "Courier / transport", "Other"];

export async function listPhoneExpenses(phoneId: string): Promise<UnitExpenseRow[]> {
  const rows = await prisma.expense.findMany({ where: { phoneId }, orderBy: { expenseDate: "desc" } });
  return rows.map((row) => ({ id: row.id, category: row.category, description: row.description, amount: Number(row.amount), date: row.expenseDate.toISOString().slice(0, 10), hasReceipt: Boolean(row.receiptUrl) }));
}

/** Suggested categories first, then any others already used — for the category picker. */
export async function expenseCategories(): Promise<string[]> {
  const used = await prisma.expense.findMany({ distinct: ["category"], select: { category: true }, take: 100 });
  return Array.from(new Set([...SUGGESTED, ...used.map((row) => row.category)]));
}

/** Records an expense against one phone unit (e.g. a repair), with an optional receipt file. */
export async function createPhoneExpense(formData: FormData): Promise<{ ok: true; rows: UnitExpenseRow[] } | { ok: false; error: string }> {
  const phoneId = String(formData.get("phoneId") || "");
  const category = String(formData.get("category") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  const amount = Number(formData.get("amount") || 0);
  const date = String(formData.get("expenseDate") || "").trim();
  if (!phoneId) return { ok: false, error: "Missing unit." };
  if (!category) return { ok: false, error: "Choose or type a category." };
  if (!(amount > 0)) return { ok: false, error: "Enter an amount greater than zero." };
  if (!date) return { ok: false, error: "Pick the expense date." };
  const phone = await prisma.phone.findUnique({ where: { id: phoneId }, select: { deletedAt: true } });
  if (!phone || phone.deletedAt) return { ok: false, error: "Unit not found." };

  let receiptUrl: string | null = null;
  const receipt = formData.get("receiptFile");
  if (receipt instanceof File && receipt.size > 0) {
    const key = buildKey("expenses", receipt.name);
    await uploadFile(Buffer.from(await receipt.arrayBuffer()), key, receipt.type || "application/octet-stream");
    receiptUrl = key;
  }

  await prisma.expense.create({ data: { phoneId, category, description, amount, expenseDate: new Date(date), receiptUrl } });
  return { ok: true, rows: await listPhoneExpenses(phoneId) };
}
