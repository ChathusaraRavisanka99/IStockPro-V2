"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { auditChange } from "@/lib/entity-guard";

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
  const quotation = await prisma.quotation.findUnique({ where: { id }, select: { status: true, quoteNumber: true, totalAmount: true } });
  if (!quotation) return { ok: false, error: "Quotation not found." };
  if (quotation.status === "Converted") return { ok: false, error: "This quotation was converted to a sale and can't be deleted." };
  await prisma.quotation.delete({ where: { id } });
  await auditChange("Delete", "Quotation", id, session.user.id, { quoteNumber: quotation.quoteNumber, total: Number(quotation.totalAmount) });
  revalidatePath("/quotations");
  return { ok: true };
}
