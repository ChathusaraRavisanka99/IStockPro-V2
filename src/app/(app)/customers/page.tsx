import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ListControls } from "@/components/ui/list-controls";
import { Pagination } from "@/components/ui/pagination";
import { parsePage, parsePageSize } from "@/lib/pagination";

type Props = { searchParams: { search?: string; view?: "list" | "grid"; page?: string; pageSize?: string } };

export default async function CustomersPage({ searchParams }: Props) {
  const search = searchParams.search?.trim() || "";
  const view = searchParams.view === "grid" ? "grid" : "list";
  const page = parsePage(searchParams.page);
  const pageSize = parsePageSize(searchParams.pageSize);
  const where = {
    deletedAt: null,
    ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { phone: { contains: search, mode: "insensitive" as const } }, { email: { contains: search, mode: "insensitive" as const } }] } : {}),
  };
  const [customers, total] = await prisma.$transaction([
    prisma.customer.findMany({
    where,
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: { createdAt: "desc" },
    include: {
      sales: true,
    },
  }),
    prisma.customer.count({ where }),
  ]);

  async function createCustomer(formData: FormData) {
    "use server";

    const name = String(formData.get("name") || "").trim();
    const phone = String(formData.get("phone") || "").trim() || null;
    const email = String(formData.get("email") || "").trim() || null;
    const address = String(formData.get("address") || "").trim() || null;

    if (!name) return;
    await prisma.customer.create({ data: { name, phone, email, address } });
    revalidatePath("/customers");
  }

  async function replaceCustomer(formData: FormData) {
    "use server";

    const id = String(formData.get("id") || "");
    const name = String(formData.get("name") || "").trim();
    if (!id || !name) return;
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer || customer.deletedAt) return;

    await prisma.$transaction([
      prisma.customer.update({ where: { id }, data: { deletedAt: new Date() } }),
      prisma.customer.create({
        data: {
          name,
          phone: String(formData.get("phone") || "").trim() || null,
          email: String(formData.get("email") || "").trim() || null,
          address: String(formData.get("address") || "").trim() || null,
        },
      }),
    ]);
    revalidatePath("/customers");
  }

  async function deleteCustomer(formData: FormData) {
    "use server";
    const id = String(formData.get("id") || "");
    if (!id) return;
    await prisma.customer.update({ where: { id }, data: { deletedAt: new Date() } });
    revalidatePath("/customers");
  }

  return (
    <div>
      <PageHeader title="Customers" subtitle="Customer records with purchase history and lifetime value" />
      <ListControls search={search} view={view} placeholder="Search customers by name, phone, or email" />
      <Card className="mb-4">
        <form action={createCustomer} className="grid gap-3 md:grid-cols-4">
          <input name="name" required placeholder="Customer name" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          <input name="phone" placeholder="Phone" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          <input name="email" placeholder="Email" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          <input name="address" placeholder="Address" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          <button className="rounded-lg bg-slate-900 px-3 py-2 text-white md:col-span-4">Add Customer</button>
        </form>
      </Card>
      {view === "grid" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {customers.map((customer) => {
            const lifetimeValue = customer.sales.reduce((acc, sale) => acc + Number(sale.totalAmount), 0);
            return (
              <Card key={customer.id}>
                <p className="font-semibold text-slate-900">{customer.name}</p>
                <p className="mt-1 text-sm text-slate-700">{customer.phone || "No phone"}</p>
                <p className="text-sm text-slate-700">{customer.email || "No email"}</p>
                <p className="mt-3 text-sm text-slate-700">{customer.sales.length} sales | ${lifetimeValue.toFixed(2)}</p>
                <div className="mt-3 flex gap-2">
                  <form action={deleteCustomer}><input type="hidden" name="id" value={customer.id} /><button className="rounded-lg border border-red-200 px-3 py-1 text-sm text-red-700">Archive</button></form>
                  <form action={replaceCustomer}><input type="hidden" name="id" value={customer.id} /><input type="hidden" name="name" value={customer.name} /><input type="hidden" name="phone" value={customer.phone || ""} /><input type="hidden" name="email" value={customer.email || ""} /><input type="hidden" name="address" value={customer.address || ""} /><button className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-700">Save Copy</button></form>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-slate-700">
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">Phone</th>
                <th className="px-2 py-2">Sales</th>
                  <th className="px-2 py-2">Lifetime Value</th>
                  <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => {
                const lifetimeValue = customer.sales.reduce((acc, sale) => acc + Number(sale.totalAmount), 0);
                return (
                  <tr key={customer.id} className="border-b border-slate-200">
                    <td className="px-2 py-2 font-medium">{customer.name}</td>
                    <td className="px-2 py-2">{customer.phone || "-"}</td>
                    <td className="px-2 py-2">{customer.sales.length}</td>
                    <td className="px-2 py-2">${lifetimeValue.toFixed(2)}</td>
                    <td className="px-2 py-2"><form action={deleteCustomer}><input type="hidden" name="id" value={customer.id} /><button className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700">Archive</button></form></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} query={{ ...(search ? { search } : {}), ...(view ? { view } : {}) }} />
    </div>
  );
}
