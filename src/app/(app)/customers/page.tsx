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
import { checkReauth } from "@/lib/reauth";
import { PasswordConfirmDialog } from "@/components/ui/password-confirm-dialog";
import { CustomerEditDialog } from "@/components/customers/customer-edit-dialog";
import type { ActionResult } from "@/components/ui/editable-row";

type Props = { searchParams: { search?: string; view?: "list" | "grid"; page?: string; pageSize?: string } };

export default async function CustomersPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  const username = session?.user?.username;
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

  async function updateCustomer(formData: FormData): Promise<ActionResult> {
    "use server";

    const id = String(formData.get("id") || "");
    const name = String(formData.get("name") || "").trim();
    if (!id || !name) return { ok: false, error: "Name is required." };
    const customer = await prisma.customer.findUnique({ where: { id }, select: { deletedAt: true } });
    if (!customer || customer.deletedAt) return { ok: false, error: "Customer not found." };

    await prisma.customer.update({
      where: { id },
      data: {
        name,
        phone: String(formData.get("phone") || "").trim() || null,
        email: String(formData.get("email") || "").trim() || null,
        address: String(formData.get("address") || "").trim() || null,
      },
    });
    revalidatePath("/customers");
    revalidatePath(`/customers/${id}`);
    return { ok: true };
  }

  async function deleteCustomer(formData: FormData): Promise<ActionResult> {
    "use server";
    const check = await checkReauth(formData);
    if (!check.ok) return check;
    const id = String(formData.get("id") || "");
    if (!id) return { ok: false, error: "Missing customer." };
    // Soft delete: past sales keep their customer; the record is purged after 30 days
    // only if nothing references it any more (see src/lib/purge.ts).
    await prisma.customer.update({ where: { id }, data: { deletedAt: new Date() } });
    revalidatePath("/customers");
    return { ok: true };
  }

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Customer records with purchase history and lifetime value"
        help={
          <p>
            Add a customer here to keep their contact details on file and track their lifetime spend. Open a customer to
            see their full purchase history. Edit a customer to update their details. Deleting one asks for your password, removes them from this
            list without touching their past sales, and permanently deletes the record after 30 days.
          </p>
        }
      />
      <Card className="mb-4">
        <form action={createCustomer} className="grid gap-3 md:grid-cols-4">
          <input name="name" required placeholder="Customer name" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          <input name="phone" placeholder="Phone" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          <input name="email" placeholder="Email" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          <input name="address" placeholder="Address" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          <button className="rounded-lg bg-slate-900 px-3 py-2 text-white md:col-span-4">Add Customer</button>
        </form>
      </Card>

      <ListControls search={search} view={view} placeholder="Search customers by name, phone, or email" />

      {view === "grid" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {customers.map((customer) => {
            const lifetimeValue = customer.sales.reduce((acc, sale) => acc + Number(sale.totalAmount), 0);
            return (
              <Card key={customer.id}>
                <Link href={`/customers/${customer.id}`} className="font-semibold text-slate-900 underline">{customer.name}</Link>
                <p className="mt-1 text-sm text-slate-700">{customer.phone || "No phone"}</p>
                <p className="text-sm text-slate-700">{customer.email || "No email"}</p>
                <p className="mt-3 text-sm text-slate-700">{customer.sales.length} sales | {formatMoney(lifetimeValue)}</p>
                <div className="mt-3 flex gap-2">
                  <CustomerEditDialog customer={{ id: customer.id, name: customer.name, phone: customer.phone, email: customer.email, address: customer.address }} action={updateCustomer} buttonClassName="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-700" />
                  <PasswordConfirmDialog
                    label="Delete"
                    title={`Delete ${customer.name}?`}
                    message="The customer is removed from this list; their past sales stay intact. It's permanently deleted after 30 days. Enter your password to confirm."
                    username={username}
                    fields={{ id: customer.id }}
                    action={deleteCustomer}
                    buttonClassName="rounded-lg border border-red-200 px-3 py-1 text-sm text-red-700"
                  />
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
                    <td className="px-2 py-2 font-medium"><Link href={`/customers/${customer.id}`} className="underline">{customer.name}</Link></td>
                    <td className="px-2 py-2">{customer.phone || "-"}</td>
                    <td className="px-2 py-2">{customer.sales.length}</td>
                    <td className="px-2 py-2">{formatMoney(lifetimeValue)}</td>
                    <td className="px-2 py-2">
                      <div className="flex gap-2">
                  <CustomerEditDialog customer={{ id: customer.id, name: customer.name, phone: customer.phone, email: customer.email, address: customer.address }} action={updateCustomer} />
                  <PasswordConfirmDialog
                    label="Delete"
                    title={`Delete ${customer.name}?`}
                    message="The customer is removed from this list; their past sales stay intact. It's permanently deleted after 30 days. Enter your password to confirm."
                    username={username}
                    fields={{ id: customer.id }}
                    action={deleteCustomer}
                  />
                      </div>
                    </td>
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
