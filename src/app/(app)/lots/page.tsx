import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { canViewCost } from "@/lib/rbac";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ListControls } from "@/components/ui/list-controls";
import { Pagination } from "@/components/ui/pagination";
import { parsePage, parsePageSize } from "@/lib/pagination";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatMoney } from "@/lib/currency";

type Props = {
  searchParams?: {
    imei?: string;
    search?: string;
    view?: "list" | "grid";
    page?: string;
    pageSize?: string;
    from?: string;
    to?: string;
  };
};

export default async function LotsPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  const showCost = canViewCost(session?.user?.role as "admin" | "manager" | "staff" | undefined);
  const imeiQuery = searchParams?.imei?.trim();
  const search = searchParams?.search?.trim() || "";
  const view = searchParams?.view === "grid" ? "grid" : "list";
  const page = parsePage(searchParams?.page);
  const pageSize = parsePageSize(searchParams?.pageSize);
  const fromDate = searchParams?.from?.trim() || "";
  const toDate = searchParams?.to?.trim() || "";
  const lotWhere = {
    deletedAt: null,
    ...(search ? { OR: [{ lotNumber: { contains: search, mode: "insensitive" as const } }, { supplier: { name: { contains: search, mode: "insensitive" as const } } }] } : {}),
    ...(fromDate || toDate
      ? {
          purchaseDate: {
            ...(fromDate ? { gte: new Date(`${fromDate}T00:00:00`) } : {}),
            ...(toDate ? { lte: new Date(`${toDate}T23:59:59.999`) } : {}),
          },
        }
      : {}),
  };

  const [suppliers, lots, total] = await Promise.all([
    prisma.supplier.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.lot.findMany({
      where: lotWhere,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { purchaseDate: "desc" },
      include: {
        supplier: true,
        phones: {
          select: {
            id: true,
            imei: true,
            purchasePrice: true,
          },
        },
      },
    }),
    prisma.lot.count({ where: lotWhere }),
  ]);

  const imeiMatch = imeiQuery
    ? await prisma.phone.findUnique({
        where: { imei: imeiQuery },
        include: {
          lot: { include: { supplier: true } },
          phoneVariant: { include: { phoneModel: true } },
        },
      })
    : null;

  async function createLot(formData: FormData) {
    "use server";

    const lotNumber = String(formData.get("lotNumber") || "").trim();
    const supplierId = String(formData.get("supplierId") || "");
    const purchaseDate = String(formData.get("purchaseDate") || "").trim();

    if (!lotNumber || !supplierId || !purchaseDate) return;

    // Every lot starts life as a bare Collection: no costs are known yet, they
    // accumulate as phones/items get added, and there's nothing to pay against until
    // then — payments, shipping, and clearance charges all happen at later stages.
    const lot = await prisma.lot.create({
      data: {
        lotNumber,
        supplierId,
        purchaseDate: new Date(purchaseDate),
        status: "Collection",
      },
    });

    revalidatePath("/lots");
    redirect(`/lots/${lot.id}`);
  }

  async function createSupplierDependency(formData: FormData) {
    "use server";
    const name = String(formData.get("name") || "").trim();
    if (!name) return;
    await prisma.supplier.create({ data: { name, phone: String(formData.get("phone") || "").trim() || null, email: String(formData.get("email") || "").trim() || null } });
    revalidatePath("/lots");
  }

  return (
    <div>
      <PageHeader title="Lots" subtitle="Track batches, landed cost allocation, and IMEI source lookup" />

      <Card className="mb-4">
        <form action={createLot} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="grid min-w-0 gap-1 text-sm text-slate-700">
            Lot number
            <input name="lotNumber" required placeholder="e.g. LOT-0003" className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
          </label>
          <label className="grid min-w-0 gap-1 text-sm text-slate-700">
            Supplier
            <SearchableSelect
              name="supplierId"
              required
              placeholder="Select supplier"
              options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
              quickAdd={{ label: "Supplier", action: createSupplierDependency, fields: [{ name: "name", label: "Name", required: true }, { name: "phone", label: "Phone" }, { name: "email", label: "Email" }] }}
            />
          </label>
          <label className="grid min-w-0 gap-1 text-sm text-slate-700">
            Start date
            <input name="purchaseDate" type="date" required className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
          </label>
          <div className="flex items-end">
            <button className="rounded-lg bg-slate-900 px-3 py-2 text-white">Create</button>
          </div>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          Every lot starts in Collection — add phones and accessories on its own page next; the goods cost builds up from
          what you enter there. Shipping, tax, and clearance charges are added later as the lot moves stages.
        </p>
      </Card>

      <Card className="mb-4">
        <form method="get" className="flex gap-2">
          <input
            name="imei"
            defaultValue={imeiQuery || ""}
            placeholder="Search IMEI"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          />
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-white">Search</button>
        </form>
        {imeiQuery ? (
          <div className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            {imeiMatch ? (
              <p>
                IMEI <span className="font-semibold">{imeiMatch.imei}</span> belongs to lot <span className="font-semibold">{imeiMatch.lot.lotNumber}</span>
                {" "}from {imeiMatch.lot.supplier.name} ({imeiMatch.phoneVariant.phoneModel.brand} {imeiMatch.phoneVariant.phoneModel.modelName}).
              </p>
            ) : (
              <p>No lot found for this IMEI.</p>
            )}
          </div>
        ) : null}
      </Card>

      <ListControls search={search} view={view} placeholder="Search lot number or supplier" dateRange={{ from: fromDate, to: toDate }} />

      {view === "grid" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lots.map((lot) => {
            const units = lot.phones.length;
            const landedTotal = Number(lot.shippingCost) + Number(lot.taxCost) + Number(lot.customsCost) + Number(lot.otherCost);
            const landedPerUnit = units > 0 ? landedTotal / units : 0;
            return (
              <Card key={lot.id}>
                <p className="font-semibold text-slate-900">{lot.lotNumber}</p>
                <p className="mt-1 text-sm text-slate-700">{lot.supplier.name}</p>
                <p className="text-sm text-slate-700">{lot.purchaseDate.toISOString().slice(0, 10)}</p>
                <p className="mt-3 text-sm text-slate-700">{units} unit{units === 1 ? "" : "s"}</p>
                {showCost ? <p className="text-sm text-slate-700">Landed cost/unit: {formatMoney(landedPerUnit)}</p> : null}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${lot.status === "Cleared" ? "bg-sky-100 text-sky-800" : lot.status === "Shipped" ? "bg-indigo-100 text-indigo-800" : "bg-slate-200 text-slate-700"}`}>{lot.status}</span>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${lot.paymentStatus === "Paid" ? "bg-green-100 text-green-800" : lot.paymentStatus === "Partial" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>{lot.paymentStatus}</span>
                </div>
                <div>
                  <Link href={`/lots/${lot.id}`} className="mt-3 inline-block rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-800">View</Link>
                </div>
              </Card>
            );
          })}
          {!lots.length ? <p className="text-sm text-slate-600">No lots created yet.</p> : null}
        </div>
      ) : (
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-slate-700">
                <th className="px-2 py-2">Lot</th>
                <th className="px-2 py-2">Supplier</th>
                <th className="px-2 py-2">Start Date</th>
                <th className="px-2 py-2">Units</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Payment</th>
                {showCost ? <th className="px-2 py-2">Landed Cost/Unit</th> : null}
                <th className="px-2 py-2">View</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => {
                const units = lot.phones.length;
                const landedTotal = Number(lot.shippingCost) + Number(lot.taxCost) + Number(lot.customsCost) + Number(lot.otherCost);
                const landedPerUnit = units > 0 ? landedTotal / units : 0;
                return (
                  <tr key={lot.id} className="border-b border-slate-200">
                    <td className="px-2 py-2 font-medium">{lot.lotNumber}</td>
                    <td className="px-2 py-2">{lot.supplier.name}</td>
                    <td className="px-2 py-2">{lot.purchaseDate.toISOString().slice(0, 10)}</td>
                    <td className="px-2 py-2">{units}</td>
                    <td className="px-2 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${lot.status === "Cleared" ? "bg-sky-100 text-sky-800" : lot.status === "Shipped" ? "bg-indigo-100 text-indigo-800" : "bg-slate-200 text-slate-700"}`}>{lot.status}</span>
                    </td>
                    <td className="px-2 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${lot.paymentStatus === "Paid" ? "bg-green-100 text-green-800" : lot.paymentStatus === "Partial" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>{lot.paymentStatus}</span>
                    </td>
                    {showCost ? <td className="px-2 py-2">{formatMoney(landedPerUnit)}</td> : null}
                    <td className="px-2 py-2"><Link href={`/lots/${lot.id}`} className="text-slate-800 underline">View</Link></td>
                  </tr>
                );
              })}
              {!lots.length ? (
                <tr>
                  <td className="px-2 py-5 text-slate-600" colSpan={showCost ? 8 : 7}>
                    No lots created yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} query={{ ...(search ? { search } : {}), ...(imeiQuery ? { imei: imeiQuery } : {}), ...(fromDate ? { from: fromDate } : {}), ...(toDate ? { to: toDate } : {}), view }} />
    </div>
  );
}
