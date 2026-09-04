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
import { QuotationForm } from "@/components/quotations/quotation-form";

type CartLine = { key: string; unitPrice: number; quantity: number };

export default async function QuotationsPage({ searchParams }: { searchParams: { search?: string; filter?: string; view?: "list" | "grid"; page?: string; pageSize?: string } }) {
  const session = await getServerSession(authOptions);
  const search = searchParams.search?.trim() || "";
  const status = searchParams.filter || "";
  const page = parsePage(searchParams.page);
  const pageSize = parsePageSize(searchParams.pageSize);
  const view = searchParams.view === "grid" ? "grid" : "list";
  const [customers, models, variants] = await Promise.all([
    prisma.customer.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.phoneModel.findMany({ where: { deletedAt: null }, orderBy: [{ brand: "asc" }, { modelName: "asc" }] }),
    prisma.phoneVariant.findMany({ where: { deletedAt: null, phoneModel: { deletedAt: null } }, include: { phoneModel: true }, orderBy: { variantName: "asc" } }),
  ]);
  const quotations = await prisma.quotation.findMany({
    skip: (page - 1) * pageSize,
    take: pageSize,
    where: { ...(status ? { status } : {}), ...(search ? { OR: [{ quoteNumber: { contains: search, mode: "insensitive" } }, { customer: { name: { contains: search, mode: "insensitive" } } }] } : {}) },
    orderBy: { quoteDate: "desc" },
    include: { customer: true, items: true, convertedSale: true },
  });
  const total = await prisma.quotation.count({ where: { ...(status ? { status } : {}), ...(search ? { OR: [{ quoteNumber: { contains: search, mode: "insensitive" } }, { customer: { name: { contains: search, mode: "insensitive" } } }] } : {}) } });

  async function createQuotation(formData: FormData) {
    "use server";

    const customerId = String(formData.get("customerId") || "").trim() || null;
    const customerEmail = String(formData.get("customerEmail") || "").trim() || null;
    const customerPhone = String(formData.get("customerPhone") || "").trim() || null;
    const taxTypeInput = String(formData.get("taxType") || "Percent");
    const taxType = (taxTypeInput === "Amount" ? "Amount" : "Percent") as "Percent" | "Amount";
    const taxValue = Number(formData.get("taxValue") || 0);
    const handlingFee = Number(formData.get("handlingFee") || 0);
    const validDays = Number(formData.get("validDays") || 7);
    const notes = String(formData.get("notes") || "").trim() || null;

    let cartLines: CartLine[] = [];
    try {
      cartLines = JSON.parse(String(formData.get("cartItems") || "[]"));
    } catch {
      cartLines = [];
    }

    // An empty cart must not produce a phantom $0 quotation with no line items.
    if (!cartLines.length) return;

    const subtotal = cartLines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    const taxPercent = taxType === "Percent" ? taxValue : subtotal > 0 ? (taxValue / subtotal) * 100 : 0;
    const taxAmount = taxType === "Percent" ? (subtotal * taxValue) / 100 : taxValue;
    const totalAmount = subtotal + taxAmount + handlingFee;

    await prisma.quotation.create({
      data: {
        quoteNumber: `QTN-${Date.now()}`,
        customerId,
        customerEmail,
        customerPhone,
        subtotal,
        taxType,
        taxPercent,
        taxAmount,
        handlingFee,
        totalAmount,
        notes,
        validUntil: new Date(Date.now() + validDays * 86400000),
        status: "Draft",
        items: {
          create: cartLines.map((line) => {
            const [itemType, itemId] = line.key.split(":");
            return {
              description: itemType === "variant" ? "Phone variant" : "Phone model",
              phoneModelId: itemType === "model" ? itemId : null,
              phoneVariantId: itemType === "variant" ? itemId : null,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              lineTotal: line.unitPrice * line.quantity,
            };
          }),
        },
      },
    });

    revalidatePath("/quotations");
  }

  async function convertQuotationToSale(formData: FormData) {
    "use server";

    const quotationId = String(formData.get("quotationId") || "");
    const quotation = await prisma.quotation.findUnique({ where: { id: quotationId } });
    if (!quotation) return;

    const now = Date.now();
    const sale = await prisma.sale.create({
      data: {
        saleNumber: `SAL-${now}`,
        customerId: quotation.customerId,
        subtotal: quotation.subtotal,
        taxType: quotation.taxType,
        taxPercent: quotation.taxPercent,
        taxAmount: quotation.taxAmount,
        handlingFee: quotation.handlingFee,
        discount: 0,
        totalAmount: quotation.totalAmount,
        createdById: session?.user?.id || "system",
      },
    });

    await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-${now}`,
        saleId: sale.id,
        totalAmount: quotation.totalAmount,
        status: "Unpaid",
      },
    });

    await prisma.quotation.update({
      where: { id: quotation.id },
      data: { status: "Converted", convertedSaleId: sale.id },
    });

    revalidatePath("/quotations");
    revalidatePath("/sales");
  }

  async function createCustomerDependency(formData: FormData) {
    "use server";
    const name = String(formData.get("name") || "").trim();
    if (!name) return;
    await prisma.customer.create({ data: { name, phone: String(formData.get("phone") || "").trim() || null, email: String(formData.get("email") || "").trim() || null } });
    revalidatePath("/quotations");
  }

  return (
    <div>
      <PageHeader title="Quotations" subtitle="Create, price, and convert quotations into sales" />
      <ListControls search={search} filter={status} view={view} filterLabel="All statuses" filterOptions={["Draft", "Converted"].map((value) => ({ label: value, value }))} placeholder="Search quote number or customer" />
      <Card className="mb-4">
        <QuotationForm
          customers={customers.map((customer) => ({ value: customer.id, label: customer.name }))}
          customerQuickAdd={{ label: "Customer", action: createCustomerDependency, fields: [{ name: "name", label: "Name", required: true }, { name: "phone", label: "Phone" }, { name: "email", label: "Email" }] }}
          items={[
            ...models.map((model) => ({ value: `model:${model.id}`, label: `${model.brand} ${model.modelName}`, price: 0, category: "Model" })),
            ...variants.map((variant) => ({ value: `variant:${variant.id}`, label: `${variant.phoneModel.brand} ${variant.phoneModel.modelName} - ${variant.variantName}`, price: 0, category: "Variant" })),
          ]}
          action={createQuotation}
        />
      </Card>
      {view === "grid" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {quotations.map((q) => <Card key={q.id}><p className="font-semibold text-slate-900">{q.quoteNumber}</p><p className="mt-1 text-sm text-slate-700">{q.customer?.name || "Walk-in"}</p><p className="text-sm text-slate-700">Valid until {q.validUntil ? q.validUntil.toISOString().slice(0, 10) : "-"}</p><p className="mt-3 text-lg font-semibold text-slate-900">${Number(q.totalAmount).toFixed(2)}</p><p className="text-sm text-slate-700">{q.status}</p><div className="mt-3 flex flex-wrap gap-2"><Link href={`/quotations/${q.id}`} className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-800">View</Link>{q.status !== "Converted" ? <form action={convertQuotationToSale}><input type="hidden" name="quotationId" value={q.id} /><button className="rounded-lg bg-slate-900 px-3 py-1 text-sm text-white">Convert</button></form> : q.convertedSale ? <Link href={`/sales/${q.convertedSale.id}`} className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-800">View Sale {q.convertedSale.saleNumber}</Link> : null}</div></Card>)}
        </div>
      ) : (
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-slate-700">
                <th className="px-2 py-2">Quote #</th>
                <th className="px-2 py-2">Customer</th>
                <th className="px-2 py-2">Valid Until</th>
                <th className="px-2 py-2">Total</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Action</th>
                <th className="px-2 py-2">View</th>
              </tr>
            </thead>
            <tbody>
              {quotations.map((q) => (
                <tr key={q.id} className="border-b border-slate-200">
                  <td className="px-2 py-2">{q.quoteNumber}</td>
                  <td className="px-2 py-2">{q.customer?.name || "Walk-in"}</td>
                  <td className="px-2 py-2">{q.validUntil ? q.validUntil.toISOString().slice(0, 10) : "-"}</td>
                  <td className="px-2 py-2">${Number(q.totalAmount).toFixed(2)}</td>
                  <td className="px-2 py-2">{q.status}</td>
                  <td className="px-2 py-2">
                    {q.status !== "Converted" ? (
                      <form action={convertQuotationToSale}>
                        <input type="hidden" name="quotationId" value={q.id} />
                        <button className="rounded-md bg-slate-900 px-2 py-1 text-xs text-white">Convert</button>
                      </form>
                    ) : q.convertedSale ? (
                      <Link href={`/sales/${q.convertedSale.id}`} className="text-slate-800 underline">
                        Sale {q.convertedSale.saleNumber}
                      </Link>
                    ) : (
                      "Converted"
                    )}
                  </td>
                  <td className="px-2 py-2"><Link href={`/quotations/${q.id}`} className="text-slate-800 underline">View</Link></td>
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
