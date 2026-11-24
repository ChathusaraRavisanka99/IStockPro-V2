import { revalidatePath } from "next/cache";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { canViewCost, canVoidInvoices } from "@/lib/rbac";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ListControls } from "@/components/ui/list-controls";
import { Pagination } from "@/components/ui/pagination";
import { parsePage, parsePageSize } from "@/lib/pagination";
import { SaleForm } from "@/components/sales/sale-form";
import { formatMoney } from "@/lib/currency";
import { formatPhoneName, formatVariantSpecs } from "@/lib/format-item-name";
import { commentsForItems, type ItemCommentRow } from "@/lib/item-comments";
import { EntityLink } from "@/components/ui/entity-link";
import { withErrorLog } from "@/lib/error-log";

type CartLine = { key: string; unitPrice: number; quantity: number };

function invoiceStatusColor(status?: string) {
  if (status === "Paid") return "bg-green-100 text-green-800";
  if (status === "PartiallyPaid") return "bg-amber-100 text-amber-800";
  if (status === "Voided") return "bg-slate-200 text-slate-700";
  return "bg-red-100 text-red-800";
}

export default async function SalesPage({ searchParams }: { searchParams: { search?: string; filter?: string; filter2?: string; filter3?: string; view?: "list" | "grid"; page?: string; pageSize?: string } }) {
  const session = await getServerSession(authOptions);
  const showCost = canViewCost(session?.user?.role as "admin" | "manager" | "staff" | undefined);
  const canDeleteSales = canVoidInvoices(session?.user?.role as "admin" | "manager" | "staff" | undefined);
  const search = searchParams.search?.trim() || "";
  const status = searchParams.filter || "";
  const paymentStatus = searchParams.filter2 || "";
  const saleType = searchParams.filter3 || "";
  const view = searchParams.view === "grid" ? "grid" : "list";
  const page = parsePage(searchParams.page);
  const pageSize = parsePageSize(searchParams.pageSize);
  const [customers, phones, accessories] = await Promise.all([
    prisma.customer.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.phone.findMany({ where: { deletedAt: null, status: "InStock" }, include: { phoneVariant: { include: { phoneModel: true } }, lot: { select: { id: true, status: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.accessory.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
  ]);
  // Internal seller-only comments, surfaced in the add-to-cart popup (never on documents).
  const [phoneComments, accessoryComments] = await Promise.all([
    commentsForItems("Phone", phones.map((phone) => phone.id)),
    commentsForItems("Accessory", accessories.map((item) => item.id)),
  ]);
  const commentRows = (rows: ItemCommentRow[] | undefined) => rows?.map(({ id, author, at, text }) => ({ id, author, at, text }));
  const saleWhere = {
    ...(status ? { status: status as "Draft" | "Completed" | "Voided" } : {}),
    ...(paymentStatus ? { invoice: { status: paymentStatus as "Unpaid" | "PartiallyPaid" | "Paid" | "Voided" } } : {}),
    ...(saleType ? { saleType: saleType as "Retail" | "Wholesale" } : {}),
    ...(search ? { OR: [{ saleNumber: { contains: search, mode: "insensitive" as const } }, { customer: { name: { contains: search, mode: "insensitive" as const } } }] } : {}),
  };
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
    return withErrorLog("sales: createSale", formData, async () => {
      const customerId = String(formData.get("customerId") || "").trim() || null;
      const saleTypeInput = String(formData.get("saleType") || "Retail");
      const saleType = (saleTypeInput === "Wholesale" ? "Wholesale" : "Retail") as "Retail" | "Wholesale";
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

      // The whole sale is one transaction. It used to look up and update every cart line one by
      // one (~2 round trips per phone); with the hosted database's latency a 10+ phone bill ran
      // past Prisma's 5 s interactive-transaction limit and crashed. Stock is now read in two
      // queries, phones are marked Sold in one guarded updateMany, and the limit is raised.
      await prisma.$transaction(async (tx) => {
        // Re-validate quantities against live stock inside the transaction — never trust
        // client-submitted quantities for inventory-affecting writes. Phones are serialized
        // (one unit per record) so quantity is always forced to 1; accessories are capped at
        // whatever is actually still in stock at submit time.
        const parsedLines = cartLines.map((line) => {
          const [itemType, itemId] = line.key.split(":");
          return { itemType, itemId, line };
        });
        const phoneIds = Array.from(new Set(parsedLines.filter((entry) => entry.itemType === "phone").map((entry) => entry.itemId)));
        const accessoryIds = Array.from(new Set(parsedLines.filter((entry) => entry.itemType === "accessory").map((entry) => entry.itemId)));
        const [livePhones, liveAccessories] = await Promise.all([
          phoneIds.length ? tx.phone.findMany({ where: { id: { in: phoneIds }, status: "InStock", deletedAt: null }, select: { id: true } }) : Promise.resolve([]),
          accessoryIds.length ? tx.accessory.findMany({ where: { id: { in: accessoryIds }, deletedAt: null }, select: { id: true, quantity: true } }) : Promise.resolve([]),
        ]);
        const inStockPhones = new Set(livePhones.map((phone) => phone.id));
        const accessoryStock = new Map(liveAccessories.map((item) => [item.id, item.quantity]));

        const resolvedLines: { itemType: "phone" | "accessory"; itemId: string; quantity: number; unitPrice: number }[] = [];
        const usedPhones = new Set<string>();
        for (const { itemType, itemId, line } of parsedLines) {
          if (itemType === "phone") {
            if (!inStockPhones.has(itemId) || usedPhones.has(itemId)) continue;
            usedPhones.add(itemId);
            resolvedLines.push({ itemType: "phone", itemId, quantity: 1, unitPrice: line.unitPrice });
          } else if (itemType === "accessory") {
            const available = accessoryStock.get(itemId);
            if (available === undefined) continue;
            const quantity = Math.max(0, Math.min(Math.round(line.quantity) || 0, available));
            if (quantity <= 0) continue;
            accessoryStock.set(itemId, available - quantity);
            resolvedLines.push({ itemType: "accessory", itemId, quantity, unitPrice: line.unitPrice });
          }
        }

        // A cart that resolves to nothing (never had items, or every line failed live-stock
        // validation above) must not produce a sale + invoice — that's a phantom $0 record.
        if (!resolvedLines.length) return;

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
            saleType,
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

        const soldPhoneIds = resolvedLines.filter((line) => line.itemType === "phone").map((line) => line.itemId);
        if (soldPhoneIds.length) {
          // Guarded by status so a unit sold elsewhere a moment ago can't be sold twice.
          const marked = await tx.phone.updateMany({ where: { id: { in: soldPhoneIds }, status: "InStock" }, data: { status: "Sold" } });
          if (marked.count !== soldPhoneIds.length) {
            throw new Error(`Stock changed while saving: ${soldPhoneIds.length - marked.count} phone(s) in this bill were sold or moved by someone else. Nothing was saved — reload and try again.`);
          }
        }
        for (const line of resolvedLines) {
          if (line.itemType === "accessory") {
            await tx.accessory.update({ where: { id: line.itemId }, data: { quantity: { decrement: line.quantity }, soldQuantity: { increment: line.quantity } } });
          }
        }
      }, { maxWait: 10_000, timeout: 30_000 });

      revalidatePath("/sales");
      revalidatePath("/items/phones");
      revalidatePath("/items/chargers");
      revalidatePath("/items/cables");
      revalidatePath("/items/other");
      revalidatePath("/dashboard");
    });
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
      <PageHeader
        title="Sales"
        subtitle="Create sales and auto-generate invoices"
        help={
          <p>
            Build a sale by picking a customer and adding phones/accessories from stock — an invoice is generated
            automatically. Open a sale afterward to record payments, print a receipt, or void it if it was made in error.
          </p>
        }
      />
      <Card className="mb-4">
        <SaleForm
          customers={customers.map((customer) => ({ value: customer.id, label: customer.name }))}
          customerQuickAdd={{ label: "Customer", action: createCustomerDependency, fields: [{ name: "name", label: "Name", required: true }, { name: "phone", label: "Phone" }, { name: "email", label: "Email" }] }}
          items={[
            ...phones.map((phone) => ({ ...(showCost ? { priceEdit: { kind: "phone" as const, id: phone.id, requiresPassword: phone.lot.status !== "Collection", detailsHref: `/lots/${phone.lot.id}?from=sales` } } : {}), comments: commentRows(phoneComments.get(phone.id)), value: `phone:${phone.id}`, label: `${formatPhoneName(phone.phoneVariant)}${phone.grade ? ` (Grade ${phone.grade})` : ""} - IMEI ${phone.imei}`, price: Number(phone.retailPrice ?? phone.wholesalePrice ?? 0), wholesalePrice: Number(phone.wholesalePrice ?? phone.retailPrice ?? 0), ...(showCost ? { cost: { unitCost: Number(phone.purchasePrice), totalCost: Number(phone.purchasePrice) + Number(phone.tagCost) + Number(phone.batteryCost) + Number(phone.repairCost), breakdown: [{ label: "Tag cost", amount: Number(phone.tagCost) }, { label: "Battery cost", amount: Number(phone.batteryCost) }, { label: "Repair cost", amount: Number(phone.repairCost) }] } } : {}), maxQuantity: 1, notes: phone.notes, category: "Phone", details: [{ label: "Model", value: `${phone.phoneVariant.phoneModel.brand} ${phone.phoneVariant.phoneModel.modelName}` }, { label: "Variant", value: phone.phoneVariant.variantName }, ...(formatVariantSpecs(phone.phoneVariant) ? [{ label: "Specs", value: formatVariantSpecs(phone.phoneVariant) }] : []), { label: "IMEI", value: phone.imei }, { label: "Grade", value: phone.grade || "Not Graded" }, { label: "Battery health", value: phone.batteryHealth !== null ? `${phone.batteryHealth}%` : "-" }, { label: "Status", value: phone.status }] })),
            ...accessories.map((item) => ({ ...(showCost ? { priceEdit: { kind: "accessory" as const, id: item.id, requiresPassword: true, detailsHref: `${({ Charger: "/items/chargers", Cable: "/items/cables", Handsfree: "/items/handsfree" } as Record<string, string>)[item.category] ?? "/items/other"}?from=sales&search=${encodeURIComponent(item.sku)}` } } : {}), comments: commentRows(accessoryComments.get(item.id)), value: `accessory:${item.id}`, label: `${item.name} (${item.sku})`, price: Number(item.retailPrice), wholesalePrice: Number(item.wholesalePrice || item.retailPrice), ...(showCost ? { cost: { unitCost: Number(item.purchasePrice), totalCost: Number(item.purchasePrice) } } : {}), maxQuantity: item.quantity, notes: item.notes, category: item.category, details: [{ label: "Name", value: item.name }, { label: "SKU", value: item.sku }, { label: "Category", value: item.category }, ...(item.connectorType || item.voltage || item.fastCharging ? [{ label: "Specs", value: [item.connectorType, item.voltage, item.fastCharging ? "Fast charging" : null].filter(Boolean).join(" · ") }] : []), { label: "In stock", value: String(item.quantity) }] })),
          ]}
          action={createSale}
        />
      </Card>

      <ListControls
        search={search}
        filter={status}
        filterLabel="All statuses"
        filterOptions={["Draft", "Completed", "Voided"].map((value) => ({ label: value, value }))}
        filter2={paymentStatus}
        filter2Label="All payment statuses"
        filterOptions2={["Unpaid", "PartiallyPaid", "Paid", "Voided"].map((value) => ({ label: value, value }))}
        filter3={saleType}
        filter3Label="Retail & Wholesale"
        filterOptions3={["Retail", "Wholesale"].map((value) => ({ label: value, value }))}
        view={view}
        placeholder="Search sale number or customer"
      />

      {view === "grid" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sales.map((sale) => (
            <Card key={sale.id}>
              <p className="font-semibold text-slate-900">{sale.saleNumber}</p>
              <p className="mt-1 text-sm text-slate-700">
                {sale.customer ? <EntityLink kind="customer" id={sale.customer.id}>{sale.customer.name}</EntityLink> : "Walk-in"}
              </p>
              <p className="text-sm text-slate-700">{sale.saleDate.toISOString().slice(0, 10)}</p>
              <p className="mt-3 text-lg font-semibold text-slate-900">{formatMoney(Number(sale.totalAmount))}</p>
              <p className="text-sm text-slate-700">{sale.invoice?.invoiceNumber || "No invoice"}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${invoiceStatusColor(sale.invoice?.status)}`}>{sale.invoice?.status || "-"}</span>
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${sale.saleType === "Wholesale" ? "bg-purple-100 text-purple-800" : "bg-slate-100 text-slate-700"}`}>{sale.saleType}</span>
              </div>
              <div className="mt-3 action-row">
                <Link href={`/sales/${sale.id}`} className="btn btn-sm btn-secondary">Manage</Link>
                <Link href={`/sales/${sale.id}/receipt`} className="btn btn-sm btn-secondary">Receipt</Link>
                {canDeleteSales ? <Link href={`/sales/${sale.id}?delete=1`} className="btn btn-sm btn-danger">Delete</Link> : null}
              </div>
            </Card>
          ))}
        </div>
      ) : (
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Sale #</th>
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Customer</th>
                <th className="px-2 py-2">Type</th>
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
                  <td className="px-2 py-2">
                    {sale.customer ? <EntityLink kind="customer" id={sale.customer.id}>{sale.customer.name}</EntityLink> : "Walk-in"}
                  </td>
                  <td className="px-2 py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${sale.saleType === "Wholesale" ? "bg-purple-100 text-purple-800" : "bg-slate-100 text-slate-700"}`}>{sale.saleType}</span>
                  </td>
                  <td className="px-2 py-2">{formatMoney(Number(sale.totalAmount))}</td>
                  <td className="px-2 py-2">{sale.invoice?.invoiceNumber || "-"}</td>
                  <td className="px-2 py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${invoiceStatusColor(sale.invoice?.status)}`}>{sale.invoice?.status || "-"}</span>
                  </td>
                  <td className="px-2 py-2">
                    <Link href={`/sales/${sale.id}`} className="text-slate-800 underline">Manage</Link>
                    <span className="mx-1 text-slate-400">·</span>
                    <Link href={`/sales/${sale.id}/receipt`} className="text-slate-800 underline">Receipt</Link>
                    {canDeleteSales ? (
                      <>
                        {" · "}
                        <Link href={`/sales/${sale.id}?delete=1`} className="text-red-700 underline">Delete</Link>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} query={{ ...(search ? { search } : {}), ...(status ? { filter: status } : {}), ...(paymentStatus ? { filter2: paymentStatus } : {}), ...(saleType ? { filter3: saleType } : {}), view }} />
    </div>
  );
}
