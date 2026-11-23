import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ListControls } from "@/components/ui/list-controls";
import { Pagination } from "@/components/ui/pagination";
import { parsePage, parsePageSize } from "@/lib/pagination";
import { ReturnForm } from "@/components/sales/return-form";
import { formatMoney } from "@/lib/currency";
import { withErrorLog } from "@/lib/error-log";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { canViewCost } from "@/lib/rbac";
import { auditChange, requireReauthWhen } from "@/lib/entity-guard";
import { EntityDeleteButton } from "@/components/ui/entity-editor";
import { EntityLink } from "@/components/ui/entity-link";
import type { ActionResult } from "@/components/ui/editable-row";
import { RETURN_DELETE_INCLUDE, deleteReturn, returnDeleteImpact } from "@/lib/return-delete";

export default async function ReturnsPage({ searchParams }: { searchParams: { search?: string; view?: "list" | "grid"; page?: string; pageSize?: string } }) {
  const search = searchParams.search?.trim() || "";
  const view = searchParams.view === "grid" ? "grid" : "list";
  const page = parsePage(searchParams.page);
  const session = await getServerSession(authOptions);
  const canDelete = canViewCost(session?.user?.role);
  const username = session?.user?.username;
  const pageSize = parsePageSize(searchParams.pageSize);
  const returns = await prisma.return.findMany({
    skip: (page - 1) * pageSize,
    take: pageSize,
    where: search ? { OR: [{ returnNumber: { contains: search, mode: "insensitive" } }, { reason: { contains: search, mode: "insensitive" } }, { sale: { saleNumber: { contains: search, mode: "insensitive" } } }] } : undefined,
    orderBy: { returnDate: "desc" },
    include: RETURN_DELETE_INCLUDE,
  });
  const total = await prisma.return.count({ where: search ? { OR: [{ returnNumber: { contains: search, mode: "insensitive" } }, { reason: { contains: search, mode: "insensitive" } }, { sale: { saleNumber: { contains: search, mode: "insensitive" } } }] } : undefined });

  async function createReturn(formData: FormData) {
    "use server";
    return withErrorLog("returns: createReturn", formData, async () => {
      const saleId = String(formData.get("saleId") || "");
      const saleItemId = String(formData.get("saleItemId") || "") || null;
      const reason = String(formData.get("reason") || "").trim() || null;
      const condition = String(formData.get("condition") || "Resalable") as "Resalable" | "Repairable" | "Damaged";
      const requestedQuantity = Number(formData.get("quantity") || 1);
      const totalCredit = Number(formData.get("totalCredit") || 0);
      const now = Date.now();

      if (!saleId) return;

      // Re-validate against the live remaining-returnable quantity — never trust a client-submitted
      // quantity for an inventory-affecting write.
      const saleItem = saleItemId
        ? await prisma.saleItem.findUnique({ where: { id: saleItemId }, include: { returnItems: { select: { quantity: true } } } })
        : null;
      const remaining = saleItem ? saleItem.quantity - saleItem.returnItems.reduce((sum, item) => sum + item.quantity, 0) : 0;
      const quantity = saleItem ? Math.max(0, Math.min(Math.round(requestedQuantity) || 0, remaining)) : Math.max(1, Math.round(requestedQuantity) || 1);
      if (saleItem && quantity <= 0) return;

      const createdReturn = await prisma.return.create({
        data: {
          saleId,
          returnNumber: `RET-${now}`,
          reason,
          items: saleItem
            ? {
                create: [
                  {
                    saleItemId: saleItem.id,
                    phoneId: saleItem.phoneId,
                    accessoryId: saleItem.accessoryId,
                    quantity,
                    condition,
                    lineAmount: totalCredit,
                  },
                ],
              }
            : undefined,
        },
      });

      await prisma.returnInvoice.create({
        data: {
          returnId: createdReturn.id,
          creditNoteNumber: `CRN-${now}`,
          totalCredit,
        },
      });

      if (saleItem?.phoneId) {
        await prisma.phone.update({ where: { id: saleItem.phoneId }, data: { status: "Returned" } });
      } else if (saleItem?.accessoryId) {
        await prisma.accessory.update({ where: { id: saleItem.accessoryId }, data: { quantity: { increment: quantity }, soldQuantity: { decrement: quantity } } });
      }

      revalidatePath("/returns");
      revalidatePath("/items/phones");
      revalidatePath("/items/chargers");
      revalidatePath("/items/cables");
      revalidatePath("/items/other");
      revalidatePath("/dashboard");
    });
  }

  // Sensitive: always asks for the password, shows what gets undone, and keeps a copy in the audit log.
  async function removeReturn(formData: FormData): Promise<ActionResult> {
    "use server";
    return withErrorLog("returns: removeReturn", formData, async () => {
      const actor = await getServerSession(authOptions);
      if (!canViewCost(actor?.user?.role)) return { ok: false, error: "Only admins and managers can delete returns." };
      const reauth = await requireReauthWhen(formData, true);
      if (!reauth.ok) return reauth;
      const id = String(formData.get("id") || "");
      const result = await deleteReturn(id);
      if (!result.ok) return result;
      await auditChange("SensitiveDelete", "Return", id, actor?.user?.id, { deleted: result.snapshot });
      for (const path of ["/returns", "/items/phones", "/items/chargers", "/items/cables", "/items/other", "/dashboard", "/reports", "/lots"]) revalidatePath(path);
      return { ok: true };
    });
  }

  function deleteButton(ret: (typeof returns)[number]) {
    const impact = returnDeleteImpact(ret);
    return (
      <EntityDeleteButton
        title={`Delete return ${ret.returnNumber}?`}
        sensitive
        username={username}
        fields={{ id: ret.id }}
        action={removeReturn}
        confirmLabel="Delete return"
        buttonClassName="btn btn-xs btn-danger"
        blockedReason={impact.blocked}
        consequences={impact.consequences}
      />
    );
  }

  async function createSaleDependency(formData: FormData) {
    "use server";
    const subtotal = Number(formData.get("subtotal") || 0);
    const user = await prisma.user.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } });
    if (!user) return;
    const now = Date.now();
    const sale = await prisma.sale.create({ data: { saleNumber: `SAL-${now}`, subtotal, totalAmount: subtotal, createdById: user.id } });
    await prisma.invoice.create({ data: { saleId: sale.id, invoiceNumber: `INV-${now}`, totalAmount: subtotal, status: "Unpaid" } });
    revalidatePath("/returns");
  }

  return (
    <div>
      <PageHeader
        title="Returns"
        subtitle="Create sale-linked returns and credit notes"
        help={
          <p>
            Every return is linked back to the original sale. Pick the sale, choose which items are coming back and why,
            and a credit note is generated automatically for the returned amount.
          </p>
        }
      />
      <Card className="mb-4">
        <ReturnForm action={createReturn} quickAddSale={createSaleDependency} />
      </Card>

      <ListControls search={search} view={view} placeholder="Search return, sale number, or reason" />

      {view === "grid" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {returns.map((ret) => (
            <Card key={ret.id}>
              <p className="font-semibold text-slate-900">{ret.returnNumber}</p>
              <p className="mt-1 text-sm text-slate-700">Sale <EntityLink kind="sale" id={ret.sale.id}>{ret.sale.saleNumber}</EntityLink></p>
              <p className="text-sm text-slate-700">{ret.returnDate.toISOString().slice(0, 10)}</p>
              <p className="mt-2 text-sm text-slate-700">{ret.reason || "No reason given"}</p>
              {ret.items.length ? <p className="mt-1 text-xs text-slate-600">{ret.items.length} item{ret.items.length === 1 ? "" : "s"} returned</p> : null}
              <p className="mt-3 text-lg font-semibold text-slate-900">{formatMoney(Number(ret.returnInvoice?.totalCredit ?? 0))}</p>
              <p className="text-xs text-slate-600">{ret.returnInvoice?.creditNoteNumber || "No credit note"}</p>
              {canDelete ? <div className="mt-3">{deleteButton(ret)}</div> : null}
            </Card>
          ))}
          {!returns.length ? <p className="text-sm text-slate-600">No returns recorded yet.</p> : null}
        </div>
      ) : (
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Return #</th>
                <th className="px-2 py-2">Sale #</th>
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Reason</th>
                <th className="px-2 py-2">Credit Note</th>
                <th className="px-2 py-2">Amount</th>
                {canDelete ? <th className="px-2 py-2 text-right">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {returns.map((ret) => (
                <tr key={ret.id} className="border-b border-slate-200">
                  <td className="px-2 py-2">{ret.returnNumber}</td>
                  <td className="px-2 py-2"><EntityLink kind="sale" id={ret.sale.id}>{ret.sale.saleNumber}</EntityLink></td>
                  <td className="px-2 py-2">{ret.returnDate.toISOString().slice(0, 10)}</td>
                  <td className="px-2 py-2">{ret.reason || "-"}</td>
                  <td className="px-2 py-2">{ret.returnInvoice?.creditNoteNumber || "-"}</td>
                  <td className="px-2 py-2">{formatMoney(Number(ret.returnInvoice?.totalCredit ?? 0))}</td>
                  {canDelete ? <td className="px-2 py-2 text-right">{deleteButton(ret)}</td> : null}
                </tr>
              ))}
              {!returns.length ? (
                <tr>
                  <td className="px-2 py-5 text-slate-600" colSpan={canDelete ? 7 : 6}>
                    No returns recorded yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} query={{ ...(search ? { search } : {}), view }} />
    </div>
  );
}
