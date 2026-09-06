import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ListControls } from "@/components/ui/list-controls";
import { Pagination } from "@/components/ui/pagination";
import { parsePage, parsePageSize } from "@/lib/pagination";
import { ReturnForm } from "@/components/sales/return-form";
import { formatMoney } from "@/lib/currency";

export default async function ReturnsPage({ searchParams }: { searchParams: { search?: string; view?: "list" | "grid"; page?: string; pageSize?: string } }) {
  const search = searchParams.search?.trim() || "";
  const view = searchParams.view === "grid" ? "grid" : "list";
  const page = parsePage(searchParams.page);
  const pageSize = parsePageSize(searchParams.pageSize);
  const sales = await prisma.sale.findMany({
    where: { ...(search ? { saleNumber: { contains: search, mode: "insensitive" } } : {}) },
    orderBy: { saleDate: "desc" },
    take: 50,
    include: {
      items: {
        include: {
          phone: { include: { phoneVariant: { include: { phoneModel: true } } } },
          accessory: true,
          returnItems: { select: { quantity: true } },
        },
      },
    },
  });
  const returns = await prisma.return.findMany({
    skip: (page - 1) * pageSize,
    take: pageSize,
    where: search ? { OR: [{ returnNumber: { contains: search, mode: "insensitive" } }, { reason: { contains: search, mode: "insensitive" } }, { sale: { saleNumber: { contains: search, mode: "insensitive" } } }] } : undefined,
    orderBy: { returnDate: "desc" },
    include: { sale: true, returnInvoice: true, items: true },
  });
  const total = await prisma.return.count({ where: search ? { OR: [{ returnNumber: { contains: search, mode: "insensitive" } }, { reason: { contains: search, mode: "insensitive" } }, { sale: { saleNumber: { contains: search, mode: "insensitive" } } }] } : undefined });

  const saleOptions = sales.map((sale) => ({
    id: sale.id,
    label: sale.saleNumber,
    items: sale.items
      .map((item) => {
        const alreadyReturned = item.returnItems.reduce((sum, returnItem) => sum + returnItem.quantity, 0);
        const remaining = item.quantity - alreadyReturned;
        return {
          id: item.id,
          label: item.phone
            ? `${item.phone.phoneVariant.phoneModel.brand} ${item.phone.phoneVariant.phoneModel.modelName} - IMEI ${item.phone.imei}`
            : item.accessory
              ? `${item.accessory.name} (${item.accessory.sku})`
              : "Line item",
          quantity: remaining,
          unitPrice: Number(item.unitPrice),
        };
      })
      .filter((item) => item.quantity > 0),
  }));

  async function createReturn(formData: FormData) {
    "use server";

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
      <PageHeader title="Returns" subtitle="Create sale-linked returns and credit notes" />
      <ListControls search={search} view={view} placeholder="Search return, sale number, or reason" />
      <Card className="mb-4">
        <ReturnForm
          sales={saleOptions}
          action={createReturn}
          quickAdd={{ label: "Sale", action: createSaleDependency, fields: [{ name: "subtotal", label: "Sale total", type: "number", required: true }] }}
        />
      </Card>
      <Pagination page={page} pageSize={pageSize} total={total} query={{ ...(search ? { search } : {}), view }} />
      {view === "grid" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {returns.map((ret) => (
            <Card key={ret.id}>
              <p className="font-semibold text-slate-900">{ret.returnNumber}</p>
              <p className="mt-1 text-sm text-slate-700">Sale {ret.sale.saleNumber}</p>
              <p className="text-sm text-slate-700">{ret.returnDate.toISOString().slice(0, 10)}</p>
              <p className="mt-2 text-sm text-slate-700">{ret.reason || "No reason given"}</p>
              {ret.items.length ? <p className="mt-1 text-xs text-slate-600">{ret.items.length} item{ret.items.length === 1 ? "" : "s"} returned</p> : null}
              <p className="mt-3 text-lg font-semibold text-slate-900">{formatMoney(Number(ret.returnInvoice?.totalCredit ?? 0))}</p>
              <p className="text-xs text-slate-600">{ret.returnInvoice?.creditNoteNumber || "No credit note"}</p>
            </Card>
          ))}
          {!returns.length ? <p className="text-sm text-slate-600">No returns recorded yet.</p> : null}
        </div>
      ) : (
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-slate-700">
                <th className="px-2 py-2">Return #</th>
                <th className="px-2 py-2">Sale #</th>
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Reason</th>
                <th className="px-2 py-2">Credit Note</th>
                <th className="px-2 py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {returns.map((ret) => (
                <tr key={ret.id} className="border-b border-slate-200">
                  <td className="px-2 py-2">{ret.returnNumber}</td>
                  <td className="px-2 py-2">{ret.sale.saleNumber}</td>
                  <td className="px-2 py-2">{ret.returnDate.toISOString().slice(0, 10)}</td>
                  <td className="px-2 py-2">{ret.reason || "-"}</td>
                  <td className="px-2 py-2">{ret.returnInvoice?.creditNoteNumber || "-"}</td>
                  <td className="px-2 py-2">{formatMoney(Number(ret.returnInvoice?.totalCredit ?? 0))}</td>
                </tr>
              ))}
              {!returns.length ? (
                <tr>
                  <td className="px-2 py-5 text-slate-600" colSpan={6}>
                    No returns recorded yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
      )}
    </div>
  );
}
