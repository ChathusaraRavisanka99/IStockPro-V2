import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ListControls } from "@/components/ui/list-controls";
import { Pagination } from "@/components/ui/pagination";
import { parsePage, parsePageSize } from "@/lib/pagination";

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
        include: {
          phones: {
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

  async function archiveSupplier(formData: FormData) {
    "use server";
    const id = String(formData.get("id") || "");
    if (!id) return;
    await prisma.supplier.update({ where: { id }, data: { deletedAt: new Date() } });
    revalidatePath("/suppliers");
  }

  return (
    <div>
      <PageHeader title="Suppliers" subtitle="Manage suppliers and view sourcing analytics" />
      <ListControls search={search} view={view} placeholder="Search suppliers by name, phone, or email" />

      <Card className="mb-4">
        <form action={createSupplier} className="grid gap-3 md:grid-cols-4">
          <input name="name" required placeholder="Supplier name" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          <input name="phone" placeholder="Phone" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          <input name="email" placeholder="Email" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          <input name="address" placeholder="Address" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          <button className="rounded-lg bg-slate-900 px-3 py-2 text-white md:col-span-4">Add Supplier</button>
        </form>
      </Card>

      {view === "grid" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {suppliers.map((supplier) => {
            const units = supplier.lots.reduce((acc, lot) => acc + lot.phones.length, 0);
            return <Card key={supplier.id}><p className="font-semibold text-slate-900">{supplier.name}</p><p className="mt-1 text-sm text-slate-700">{supplier.phone || supplier.email || "No contact"}</p><p className="mt-3 text-sm text-slate-700">{supplier.lots.length} lots | {units} units</p><form action={archiveSupplier} className="mt-3"><input type="hidden" name="id" value={supplier.id} /><button className="rounded-lg border border-red-200 px-3 py-1 text-sm text-red-700">Archive</button></form></Card>;
          })}
        </div>
      ) : (
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-slate-700">
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
                    <td className="px-2 py-2 font-medium">{supplier.name}</td>
                    <td className="px-2 py-2">{supplier.phone || supplier.email || "-"}</td>
                    <td className="px-2 py-2">{supplier.lots.length}</td>
                    <td className="px-2 py-2">{units}</td>
                    <td className="px-2 py-2">${estimatedSpend.toFixed(2)}</td>
                    <td className="px-2 py-2"><form action={archiveSupplier}><input type="hidden" name="id" value={supplier.id} /><button className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700">Archive</button></form></td>
                  </tr>
                );
              })}
              {!suppliers.length ? (
                <tr>
                  <td className="px-2 py-5 text-slate-600" colSpan={5}>
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
