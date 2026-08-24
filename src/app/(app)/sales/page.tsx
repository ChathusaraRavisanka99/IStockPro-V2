import { revalidatePath } from "next/cache";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ListControls } from "@/components/ui/list-controls";
import { Pagination } from "@/components/ui/pagination";
import { parsePage, parsePageSize } from "@/lib/pagination";
import { SaleForm } from "@/components/sales/sale-form";

type CartLine = { key: string; unitPrice: number; quantity: number };

function invoiceStatusColor(status?: string) {
  if (status === "Paid") return "bg-green-100 text-green-800";
  if (status === "PartiallyPaid") return "bg-amber-100 text-amber-800";
  if (status === "Voided") return "bg-slate-200 text-slate-700";
  return "bg-red-100 text-red-800";
}

export default async function SalesPage({ searchParams }: { searchParams: { search?: string; filter?: string; view?: "list" | "grid"; page?: string; pageSize?: string } }) {
  const session = await getServerSession(authOptions);
  const search = searchParams.search?.trim() || "";
  const status = searchParams.filter || "";
  const view = searchParams.view === "grid" ? "grid" : "list";
  const page = parsePage(searchParams.page);
  const pageSize = parsePageSize(searchParams.pageSize);
  const [customers, phones, accessories] = await Promise.all([
    prisma.customer.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.phone.findMany({ where: { deletedAt: null, status: "InStock" }, include: { phoneVariant: { include: { phoneModel: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.accessory.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
  ]);
  const saleWhere = { ...(status ? { status: status as "Draft" | "Completed" | "Voided" } : {}), ...(search ? { OR: [{ saleNumber: { contains: search, mode: "insensitive" as const } }, { customer: { name: { contains: search, mode: "insensitive" as const } } }] } : {}) };
  const [sales, total] = await prisma.$transaction([prisma.sale.findMany({
    where: saleWhere,
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: { saleDate: "desc" },
    include: {
      customer: true,
      invoice: true,
    },
  }), prisma.sale.count({ where: saleWhere })]);

  async function createSale(formData: FormData) {
    "use server";

    const customerId = String(formData.get("customerId") || "").trim() || null;
    const taxTypeInput = String(formData.get("taxType") || "Amount");
    const taxType = (taxTypeInput === "Percent" ? "Percent" : "Amount") as "Percent" | "Amount";
    const taxValue = Number(formData.get("taxValue") || 0);
    const handlingFee = Number(formData.get("handlingFee") || 0);
    const discount = Number(formData.get("discount") || 0);

    let cartLines: CartLine[] = [];
    try {
      cartLines = JSON.parse(String(formData.get("cartItems") || "[]"));
    } catch {
      cartLines = [];
    }

    const now = Date.now();

    await prisma.$transaction(async (tx) => {
      // Re-validate quantities against live stock inside the transaction — never trust
      // client-submitted quantities for inventory-affecting writes. Phones are serialized
      // (one unit per record) so quantity is always forced to 1; accessories are capped at
      // whatever is actually still in stock at submit time.
      const resolvedLines: { itemType: "phone" | "accessory"; itemId: string; quantity: number; unitPrice: number }[] = [];
      for (const line of cartLines) {
        const [itemType, itemId] = line.key.split(":");
        if (itemType === "phone") {
          const phone = await tx.phone.findUnique({ where: { id: itemId } });
          if (!phone || phone.status !== "InStock") continue;
          resolvedLines.push({ itemType: "phone", itemId, quantity: 1, unitPrice: line.unitPrice });
        } else if (itemType === "accessory") {
          const accessory = await tx.accessory.findUnique({ where: { id: itemId } });
          if (!accessory) continue;
          const quantity = Math.max(0, Math.min(Math.round(line.quantity) || 0, accessory.quantity));
          if (quantity <= 0) continue;
          resolvedLines.push({ itemType: "accessory", itemId, quantity, unitPrice: line.unitPrice });
        }
      }

      const subtotal = resolvedLines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
      // Recompute the tax split from the server-validated subtotal — never trust a
      // client-submitted tax amount, since quantities may have just been clamped above.
      const taxPercent = taxType === "Percent" ? taxValue : subtotal > 0 ? (taxValue / subtotal) * 100 : 0;
      const taxAmount = taxType === "Percent" ? (subtotal * taxValue) / 100 : taxValue;
      const totalAmount = subtotal + taxAmount + handlingFee - discount;

      const sale = await tx.sale.create({
        data: {
          saleNumber: `SAL-${now}`,
          customerId,
          subtotal,
          taxType,
          taxPercent,
          taxAmount,
          handlingFee,
          discount,
          totalAmount,
          createdById: session?.user?.id || "system",
          items: {
            create: resolvedLines.map((line) => ({
              phoneId: line.itemType === "phone" ? line.itemId : null,
              accessoryId: line.itemType === "accessory" ? line.itemId : null,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              lineTotal: line.unitPrice * line.quantity,
            })),
          },
        },
      });

      await tx.invoice.create({
        data: {
          saleId: sale.id,
          invoiceNumber: `INV-${now}`,
          totalAmount,
          status: "Unpaid",
        },
      });

      for (const line of resolvedLines) {
        if (line.itemType === "phone") {
          await tx.phone.update({ where: { id: line.itemId }, data: { status: "Sold" } });
        } else {
          await tx.accessory.update({ where: { id: line.itemId }, data: { quantity: { decrement: line.quantity }, soldQuantity: { increment: line.quantity } } });
        }
      }
    });

    revalidatePath("/sales");
    revalidatePath("/items/phones");
    revalidatePath("/items/chargers");
    revalidatePath("/items/cables");
    revalidatePath("/items/other");
    revalidatePath("/dashboard");
  }

  async function createCustomerDependency(formData: FormData) {
    "use server";
    const name = String(formData.get("name") || "").trim();
    if (!name) return;
    await prisma.customer.create({ data: { name, phone: String(formData.get("phone") || "").trim() || null, email: String(formData.get("email") || "").trim() || null } });
    revalidatePath("/sales");
  }

  return (
    <div>
      <PageHeader title="Sales" subtitle="Create sales and auto-generate invoices" />
      <ListControls search={search} filter={status} view={view} filterLabel="All statuses" filterOptions={["Draft", "Completed", "Voided"].map((value) => ({ label: value, value }))} placeholder="Search sale number or customer" />
      <Card className="mb-4">
        <SaleForm
          customers={customers.map((customer) => ({ value: customer.id, label: customer.name }))}
          customerQuickAdd={{ label: "Customer", action: createCustomerDependency, fields: [{ name: "name", label: "Name", required: true }, { name: "phone", label: "Phone" }, { name: "email", label: "Email" }] }}
          items={[
            ...phones.map((phone) => ({ value: `phone:${phone.id}`, label: `${phone.phoneVariant.phoneModel.brand} ${phone.phoneVariant.phoneModel.modelName}${phone.grade ? ` (Grade ${phone.grade})` : ""} - IMEI ${phone.imei}`, price: Number(phone.retailPrice ?? phone.wholesalePrice ?? 0), maxQuantity: 1, notes: phone.notes, category: "Phone" })),
            ...accessories.map((item) => ({ value: `accessory:${item.id}`, label: `${item.name} (${item.sku})`, price: Number(item.retailPrice), maxQuantity: item.quantity, notes: item.notes, category: item.category })),
          ]}
          action={createSale}
        />
      </Card>
      {view === "grid" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sales.map((sale) => (
            <Card key={sale.id}>
              <p className="font-semibold text-slate-900">{sale.saleNumber}</p>
              <p className="mt-1 text-sm text-slate-700">{sale.customer?.name || "Walk-in"}</p>
              <p className="text-sm text-slate-700">{sale.saleDate.toISOString().slice(0, 10)}</p>
              <p className="mt-3 text-lg font-semibold text-slate-900">${Number(sale.totalAmount).toFixed(2)}</p>
              <p className="text-sm text-slate-700">{sale.invoice?.invoiceNumber || "No invoice"}</p>
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${invoiceStatusColor(sale.invoice?.status)}`}>{sale.invoice?.status || "-"}</span>
              <div className="mt-3 flex gap-2">
                <Link href={`/sales/${sale.id}`} className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-800">Manage</Link>
                <Link href={`/sales/${sale.id}/receipt`} className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-800">Receipt</Link>
              </div>
            </Card>
          ))}
        </div>
      ) : (
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-slate-700">
                <th className="px-2 py-2">Sale #</th>
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Customer</th>
                <th className="px-2 py-2">Total</th>
                <th className="px-2 py-2">Invoice</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id} className="border-b border-slate-200">
                  <td className="px-2 py-2">{sale.saleNumber}</td>
                  <td className="px-2 py-2">{sale.saleDate.toISOString().slice(0, 10)}</td>
                  <td className="px-2 py-2">{sale.customer?.name || "Walk-in"}</td>
                  <td className="px-2 py-2">${Number(sale.totalAmount).toFixed(2)}</td>
                  <td className="px-2 py-2">{sale.invoice?.invoiceNumber || "-"}</td>
                  <td className="px-2 py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${invoiceStatusColor(sale.invoice?.status)}`}>{sale.invoice?.status || "-"}</span>
                  </td>
                  <td className="px-2 py-2">
                    <Link href={`/sales/${sale.id}`} className="text-slate-800 underline">Manage</Link>
                    <span className="mx-1 text-slate-400">·</span>
                    <Link href={`/sales/${sale.id}/receipt`} className="text-slate-800 underline">Receipt</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} query={{ ...(search ? { search } : {}), ...(status ? { filter: status } : {}), view }} />
    </div>
  );
}
