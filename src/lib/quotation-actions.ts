"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditChange } from "@/lib/entity-guard";
import { canViewCost } from "@/lib/rbac";
import { checkReauth } from "@/lib/reauth";

type Result = { ok: true } | { ok: false; error: string };

const QUOTATION_STATUSES = ["Draft", "Sent", "Accepted", "Rejected"] as const;

/** Quotation details are non-sensitive (no money/stock moves until it's converted to a sale). */
export async function updateQuotationAction(formData: FormData): Promise<Result> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { ok: false, error: "Sign in again." };
  const id = String(formData.get("id") || "");
  const quotation = await prisma.quotation.findUnique({ where: { id } });
  if (!quotation) return { ok: false, error: "Quotation not found." };
  const notes = String(formData.get("notes") || "").trim() || null;
  if (quotation.status === "Converted") {
    // Converted quotes are locked to what the customer accepted; only internal notes change.
    await prisma.quotation.update({ where: { id }, data: { notes } });
  } else {
    const status = String(formData.get("status") || quotation.status);
    if (!(QUOTATION_STATUSES as readonly string[]).includes(status)) return { ok: false, error: "Unknown status." };
    const validUntil = String(formData.get("validUntil") || "");
    await prisma.quotation.update({
      where: { id },
      data: {
        status,
        validUntil: validUntil ? new Date(validUntil) : null,
        customerPhone: String(formData.get("customerPhone") || "").trim() || null,
        customerEmail: String(formData.get("customerEmail") || "").trim() || null,
        notes,
      },
    });
  }
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
  return { ok: true };
}

export async function deleteQuotationAction(formData: FormData): Promise<Result> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { ok: false, error: "Sign in again." };
  const id = String(formData.get("id") || "");
  const quotation = await prisma.quotation.findUnique({ where: { id }, include: { items: true, convertedSale: { select: { id: true, saleNumber: true } } } });
  if (!quotation) return { ok: false, error: "Quotation not found." };
  // A converted quotation is the record of what was offered for a sale: deleting it is a
  // sensitive action (admins/managers + password). The sale itself is not touched.
  const converted = quotation.status === "Converted" || Boolean(quotation.convertedSaleId);
  if (converted) {
    if (!canViewCost(session.user.role as "admin" | "manager" | "staff" | undefined)) return { ok: false, error: "Only admins and managers can delete a quotation that was converted to a sale." };
    const reauth = await checkReauth(formData);
    if (!reauth.ok) return reauth;
  }
  await prisma.quotation.delete({ where: { id } }); // its line items cascade
  await auditChange(converted ? "SensitiveDelete" : "Delete", "Quotation", id, session.user.id, {
    quoteNumber: quotation.quoteNumber,
    status: quotation.status,
    total: Number(quotation.totalAmount),
    convertedSale: quotation.convertedSale?.saleNumber ?? null,
    items: quotation.items.map((item) => ({ description: item.description, quantity: item.quantity, unitPrice: String(item.unitPrice) })),
  });
  revalidatePath("/quotations");
  if (quotation.convertedSale) revalidatePath(`/sales/${quotation.convertedSale.id}`);
  return { ok: true };
}
