import { revalidatePath } from "next/cache";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ListControls } from "@/components/ui/list-controls";
import { Pagination } from "@/components/ui/pagination";
import { parsePage, parsePageSize } from "@/lib/pagination";
import { formatMoney } from "@/lib/currency";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { EntityDeleteButton, EntityEditButton } from "@/components/ui/entity-editor";
import { auditChange } from "@/lib/entity-guard";
import type { ActionResult } from "@/components/ui/editable-row";

type Props = { searchParams: { search?: string; view?: "list" | "grid"; page?: string; pageSize?: string } };

export default async function SuppliersPage({ searchParams }: Props) {
  const search = searchParams.search?.trim() || "";
  const view = searchParams.view === "grid" ? "grid" : "list";
  const page = parsePage(searchParams.page);
  const pageSize = parsePageSize(searchParams.pageSize);
  const supplierWhere = { deletedAt: null, ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { phone: { contains: search, mode: "insensitive" as const } }, { email: { contains: search, mode: "insensitive" as const } }] } : {}) };
  const [suppliers, total] = await prisma.$transaction([prisma.supplier.findMany({
    where: supplierWhere,
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: { createdAt: "desc" },
    include: {
      lots: {
        where: { deletedAt: null },
        include: {
          phones: {
            where: { deletedAt: null },
            select: { purchasePrice: true },
          },
        },
      },
    },
  }), prisma.supplier.count({ where: supplierWhere })]);

  async function createSupplier(formData: FormData) {
    "use server";

    const name = String(formData.get("name") || "").trim();
    const phone = String(formData.get("phone") || "").trim() || null;
    const email = String(formData.get("email") || "").trim() || null;
    const address = String(formData.get("address") || "").trim() || null;

    if (!name) return;

    await prisma.supplier.create({
      data: { name, phone, email, address },
    });

    revalidatePath("/suppliers");
  }

  // Supplier details are non-sensitive: edit directly, delete with a consequences confirm.
  async function updateSupplier(formData: FormData): Promise<ActionResult> {
    "use server";
    const id = String(formData.get("id") || "");
    const name = String(formData.get("name") || "").trim();
    if (!id || !name) return { ok: false, error: "Name is required." };
    await prisma.supplier.update({
      where: { id },
      data: {
        name,
        phone: String(formData.get("phone") || "").trim() || null,
        email: String(formData.get("email") || "").trim() || null,
        address: String(formData.get("address") || "").trim() || null,
      },
    });
    revalidatePath("/suppliers");
    revalidatePath("/lots");
    return { ok: true };
  }

  async function archiveSupplier(formData: FormData): Promise<ActionResult> {
    "use server";
    const id = String(formData.get("id") || "");
    if (!id) return { ok: false, error: "Missing supplier." };
    const actor = await getServerSession(authOptions);
    await prisma.supplier.update({ where: { id }, data: { deletedAt: new Date() } });
    await auditChange("Delete", "Supplier", id, actor?.user?.id, {});
    revalidatePath("/suppliers");
    revalidatePath("/recycle-bin");
    return { ok: true };
  }

  const supplierActions = (supplier: (typeof suppliers)[number], large = false) => {
    const units = supplier.lots.reduce((acc, lot) => acc + lot.phones.length, 0);
    return (
      <div className="flex flex-wrap gap-2">
        <EntityEditButton
          title="Edit supplier"
          subtitle={supplier.name}
          hidden={{ id: supplier.id }}
          action={updateSupplier}
          fields={[
            { name: "name", label: "Name", value: supplier.name, required: true, wide: true },
            { name: "phone", label: "Phone", value: supplier.phone ?? "", type: "tel" },
            { name: "email", label: "Email", value: supplier.email ?? "", type: "email" },
            { name: "address", label: "Address", value: supplier.address ?? "", type: "textarea" },
          ]}
          buttonClassName={large ? "btn btn-sm btn-secondary" : undefined}
        />
        <EntityDeleteButton
          title={`Delete supplier ${supplier.name}?`}
          fields={{ id: supplier.id }}
          action={archiveSupplier}
          consequences={[
            "The supplier disappears from this list and from the supplier picker when creating lots.",
            supplier.lots.length
              ? `Its ${supplier.lots.length} lot${supplier.lots.length === 1 ? "" : "s"} (${units} unit${units === 1 ? "" : "s"}) are kept and still show this supplier's name.`
              : "It has no lots, so nothing else changes.",
            "It stays in the Recycle Bin for 30 days and can be restored; after that it's removed permanently (unless lots still reference it).",
          ]}
          buttonClassName={large ? "btn btn-sm btn-danger" : undefined}
        />
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="Suppliers"
        subtitle="Manage suppliers and view sourcing analytics"
        help={
          <p>
            Suppliers are who you source stock from — add one here so it&apos;s selectable when creating a lot. The table
            below tracks how many lots and units each supplier has provided and an estimate of total spend with them.
          </p>
        }
      />

      <Card className="mb-4">
        <form action={createSupplier} className="grid gap-3 md:grid-cols-4">
          <input name="name" required placeholder="Supplier name" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          <input name="phone" placeholder="Phone" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          <input name="email" placeholder="Email" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          <input name="address" placeholder="Address" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          <button className="btn btn-md btn-primary md:col-span-4">Add Supplier</button>
        </form>
      </Card>

      <ListControls search={search} view={view} placeholder="Search suppliers by name, phone, or email" />

      {view === "grid" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {suppliers.map((supplier) => {
            const units = supplier.lots.reduce((acc, lot) => acc + lot.phones.length, 0);
            return <Card key={supplier.id}><Link href={`/suppliers/${supplier.id}`} className="font-semibold text-slate-900 underline">{supplier.name}</Link><p className="mt-1 text-sm text-slate-700">{supplier.phone || supplier.email || "No contact"}</p><p className="mt-3 text-sm text-slate-700">{supplier.lots.length} lots | {units} units</p><div className="mt-3">{supplierActions(supplier, true)}</div></Card>;
          })}
        </div>
      ) : (
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Supplier</th>
                <th className="px-2 py-2">Contact</th>
                <th className="px-2 py-2">Lots</th>
                <th className="px-2 py-2">Units Sourced</th>
                <th className="px-2 py-2">Estimated Spend</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => {
                const units = supplier.lots.reduce((acc, lot) => acc + lot.phones.length, 0);
                const estimatedSpend = supplier.lots.reduce(
                  (acc, lot) =>
                    acc +
                    lot.phones.reduce((phoneAcc, phone) => phoneAcc + Number(phone.purchasePrice), 0) +
                    Number(lot.shippingCost) +
                    Number(lot.taxCost) +
                    Number(lot.customsCost),
                  0,
                );

                return (
                  <tr key={supplier.id} className="border-b border-slate-200">
                    <td className="px-2 py-2 font-medium"><Link href={`/suppliers/${supplier.id}`} className="underline" title="View supplier stats">{supplier.name}</Link></td>
                    <td className="px-2 py-2">{supplier.phone || supplier.email || "-"}</td>
                    <td className="px-2 py-2">{supplier.lots.length}</td>
                    <td className="px-2 py-2">{units}</td>
                    <td className="px-2 py-2">{formatMoney(estimatedSpend)}</td>
                    <td className="px-2 py-2">{supplierActions(supplier)}</td>
                  </tr>
                );
              })}
              {!suppliers.length ? (
                <tr>
                  <td className="px-2 py-5 text-slate-600" colSpan={6}>
                    No suppliers yet.
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
