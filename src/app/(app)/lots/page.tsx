import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { canViewCost } from "@/lib/rbac";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { InfoHelp } from "@/components/ui/info-help";
import { ListControls } from "@/components/ui/list-controls";
import { Pagination } from "@/components/ui/pagination";
import { parsePage, parsePageSize } from "@/lib/pagination";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatMoney } from "@/lib/currency";
import { checkReauth } from "@/lib/reauth";
import { softDeleteLot, toggleLotBookmark } from "@/lib/lots";
import { BookmarkButton } from "@/components/items/bookmark-button";
import { EntityDeleteButton } from "@/components/ui/entity-editor";
import { LotFxConverter, LotFxAmount, LotFxHeader } from "@/components/items/lot-fx-converter";
import type { ActionResult } from "@/components/ui/editable-row";
import { formatPhoneName } from "@/lib/format-item-name";
import { EntityLink } from "@/components/ui/entity-link";

type Props = {
  searchParams?: {
    imei?: string;
    search?: string;
    view?: "list" | "grid";
    page?: string;
    pageSize?: string;
    from?: string;
    to?: string;
    bookmarked?: string;
  };
};

export default async function LotsPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  const showCost = canViewCost(session?.user?.role as "admin" | "manager" | "staff" | undefined);
  const username = session?.user?.username;
  const userId = session?.user?.id ?? "";
  const bookmarkedOnly = searchParams?.bookmarked === "1";
  const imeiQuery = searchParams?.imei?.trim();
  const search = searchParams?.search?.trim() || "";
  const view = searchParams?.view === "grid" ? "grid" : "list";
  const page = parsePage(searchParams?.page);
  const pageSize = parsePageSize(searchParams?.pageSize);
  const fromDate = searchParams?.from?.trim() || "";
  const toDate = searchParams?.to?.trim() || "";
  const lotWhere = {
    deletedAt: null,
    ...(bookmarkedOnly ? { bookmarks: { some: { userId } } } : {}),
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
          where: { deletedAt: null },
          select: {
            id: true,
            imei: true,
            purchasePrice: true,
            status: true,
            _count: { select: { saleItems: true } },
          },
        },
        accessoryItems: { select: { unitCost: true, quantity: true } },
        bookmarks: { where: { userId }, select: { userId: true } },
      },
    }),
    prisma.lot.count({ where: lotWhere }),
  ]);
  const myBookmarks = await prisma.lotBookmark.findMany({
    where: { userId, lot: { deletedAt: null } },
    orderBy: { createdAt: "desc" },
    include: { lot: { select: { id: true, lotNumber: true, status: true } } },
  });

  const imeiMatch = imeiQuery
    ? await prisma.phone.findFirst({
        where: { imei: imeiQuery, deletedAt: null },
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

  async function toggleBookmark(formData: FormData) {
    "use server";
    const actor = await getServerSession(authOptions);
    const lotId = String(formData.get("lotId") || "");
    if (!actor?.user?.id || !lotId) return;
    await toggleLotBookmark(actor.user.id, lotId);
    revalidatePath("/lots");
    revalidatePath(`/lots/${lotId}`);
    revalidatePath("/dashboard");
  }

  async function deleteLot(formData: FormData): Promise<ActionResult> {
    "use server";
    const check = await checkReauth(formData);
    if (!check.ok) return check;
    const result = await softDeleteLot(String(formData.get("id") || ""));
    if (!result.ok) return result;
    revalidatePath("/lots");
    revalidatePath("/items/phones");
    revalidatePath("/dashboard");
    return { ok: true };
  }

  const lotTotalCost = (lot: (typeof lots)[number]) =>
    Number(lot.shippingCost) + Number(lot.taxCost) + Number(lot.customsCost) + Number(lot.otherCost) +
    lot.phones.reduce((sum, phone) => sum + Number(phone.purchasePrice), 0) +
    lot.accessoryItems.reduce((sum, item) => sum + Number(item.unitCost) * item.quantity, 0);

  const deleteButton = (lot: (typeof lots)[number]) => {
    const soldLines = lot.phones.reduce((sum, phone) => sum + phone._count.saleItems, 0);
    const inStock = lot.phones.filter((phone) => phone.status === "InStock").length;
    return (
      <EntityDeleteButton
        title={`Delete lot ${lot.lotNumber}?`}
        sensitive
        username={username}
        fields={{ id: lot.id }}
        action={deleteLot}
        confirmLabel="Delete lot"
        blockedReason={soldLines ? `Units from this lot appear on ${soldLines} sale line${soldLines === 1 ? "" : "s"}, so it can't be deleted — sales history must keep pointing at it. Archive individual unsold units instead.` : null}
        consequences={[
          "The lot disappears from the lot list, dashboard and reports.",
          lot.phones.length ? `Its ${lot.phones.length} unit${lot.phones.length === 1 ? "" : "s"} are archived and leave stock — ${inStock} in stock right now.` : "It has no units.",
          Number(lot.amountPaid) ? `Supplier payments of ${formatMoney(lot.amountPaid)} stay attached to the deleted lot.` : "No supplier payments are recorded.",
          `The lot number ${lot.lotNumber} is freed for reuse.`,
          "It stays in the Recycle Bin for 30 days (restoring brings the units back), then is deleted permanently.",
        ]}
      />
    );
  };

  async function createSupplierDependency(formData: FormData) {
    "use server";
    const name = String(formData.get("name") || "").trim();
    if (!name) return;
    await prisma.supplier.create({ data: { name, phone: String(formData.get("phone") || "").trim() || null, email: String(formData.get("email") || "").trim() || null } });
    revalidatePath("/lots");
  }

  return (
    <div>
      <PageHeader
        title="Lots"
        subtitle="Track batches, landed cost allocation, and IMEI source lookup"
        help={
          <>
            <p>A lot is one purchased batch of stock. Create it here with just a lot number, supplier, and start date — it begins in the Collection stage.</p>
            <p className="mt-2">Open a lot to add phones and accessories to it; the goods cost builds up automatically from what you enter. From there you move it through Shipped and Cleared, adding shipping/tax/customs charges as they come in.</p>
            <p className="mt-2">Click ☆ to bookmark a lot — bookmarked lots appear as shortcuts above the list, can be filtered with &quot;Bookmarked only&quot;, and are listed first on the dashboard.</p>
            <p className="mt-2">Use Search IMEI below to trace which lot a specific phone came from, and the From/To dates to filter lots by their start date.</p>
          </>
        }
      />

      <Card className="mb-4">
        <h2 className="mb-3 flex items-center gap-1.5 text-lg font-semibold">
          Create Lot
          <InfoHelp size="sm" title="Create Lot">
            Just three fields to start — supplier and dates matter for reporting, but everything cost-related (goods, shipping, tax) is added on the lot&apos;s own page as it moves through its stages.
          </InfoHelp>
        </h2>
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
            <button className="btn btn-md btn-primary">Create</button>
          </div>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          Every lot starts in Collection — add phones and accessories on its own page next; the goods cost builds up from
          what you enter there. Shipping, tax, and clearance charges are added later as the lot moves stages.
        </p>
      </Card>

      <Card className="mb-4">
        <h2 className="mb-3 flex items-center gap-1.5 text-lg font-semibold">
          Search IMEI
          <InfoHelp size="sm" title="Search IMEI">
            Look up which lot (and supplier) a specific phone was sourced from by its IMEI.
          </InfoHelp>
        </h2>
        <form method="get" className="flex gap-2">
          <input
            name="imei"
            defaultValue={imeiQuery || ""}
            placeholder="Search IMEI"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          />
          <button className="btn btn-md btn-primary">Search</button>
        </form>
        {imeiQuery ? (
          <div className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
            {imeiMatch ? (
              <p>
                IMEI <span className="font-semibold">{imeiMatch.imei}</span> belongs to lot <span className="font-semibold">{imeiMatch.lot.lotNumber}</span>
                {" "}from {imeiMatch.lot.supplier.name} ({formatPhoneName(imeiMatch.phoneVariant)}).
              </p>
            ) : (
              <p>No lot found for this IMEI.</p>
            )}
          </div>
        ) : null}
      </Card>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link
          href={bookmarkedOnly ? "/lots" : "/lots?bookmarked=1"}
          className={`rounded-full border px-3 py-1 text-sm ${bookmarkedOnly ? "border-amber-400 bg-amber-50 text-amber-800" : "border-slate-300 text-slate-700"}`}
        >
          {bookmarkedOnly ? "★ Showing bookmarked only — show all" : "★ Bookmarked only"}
        </Link>
        {myBookmarks.map((bookmark) => (
          <Link key={bookmark.lot.id} href={`/lots/${bookmark.lot.id}`} className="rounded-full border border-amber-200 bg-amber-50/60 px-3 py-1 text-sm text-slate-800 hover:bg-amber-100">
            <span className="text-amber-500">★</span> {bookmark.lot.lotNumber}
            <span className="ml-1 text-xs text-slate-500">{bookmark.lot.status}</span>
          </Link>
        ))}
      </div>

      <ListControls search={search} view={view} placeholder="Search lot number or supplier" dateRange={{ from: fromDate, to: toDate }} />

      <LotFxConverterSlot enabled={showCost}>
      {view === "grid" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lots.map((lot) => {
            const units = lot.phones.length;
            const landedTotal = Number(lot.shippingCost) + Number(lot.taxCost) + Number(lot.customsCost) + Number(lot.otherCost);
            const landedPerUnit = units > 0 ? landedTotal / units : 0;
            return (
              <Card key={lot.id}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900">{lot.lotNumber}</p>
                  <BookmarkButton lotId={lot.id} bookmarked={lot.bookmarks.length > 0} action={toggleBookmark} />
                </div>
                <p className="mt-1 text-sm text-slate-700"><EntityLink kind="supplier" id={lot.supplierId}>{lot.supplier.name}</EntityLink></p>
                <p className="text-sm text-slate-700">{lot.purchaseDate.toISOString().slice(0, 10)}</p>
                <p className="mt-3 text-sm text-slate-700">{units} unit{units === 1 ? "" : "s"}</p>
                {showCost ? (
                  <>
                    <p className="text-sm text-slate-700">Landed cost/unit: {formatMoney(landedPerUnit)}</p>
                    <p className="text-sm text-slate-700">Total cost: {formatMoney(lotTotalCost(lot))}</p>
                    <p className="text-sm text-slate-700">In foreign currency: <LotFxAmount lkr={lotTotalCost(lot)} /></p>
                  </>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${lot.status === "Cleared" ? "bg-sky-100 text-sky-800" : lot.status === "Shipped" ? "bg-indigo-100 text-indigo-800" : "bg-slate-200 text-slate-700"}`}>{lot.status}</span>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${lot.paymentStatus === "Paid" ? "bg-green-100 text-green-800" : lot.paymentStatus === "Partial" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>{lot.paymentStatus}</span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Link href={`/lots/${lot.id}`} className="btn btn-sm btn-secondary">View</Link>
                  {deleteButton(lot)}
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
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Lot</th>
                <th className="px-2 py-2">Supplier</th>
                <th className="px-2 py-2">Start Date</th>
                <th className="px-2 py-2">Units</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Payment</th>
                {showCost ? <th className="px-2 py-2">Landed Cost/Unit</th> : null}
                {showCost ? <th className="px-2 py-2">Total Cost</th> : null}
                {showCost ? <th className="px-2 py-2"><LotFxHeader /></th> : null}
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => {
                const units = lot.phones.length;
                const landedTotal = Number(lot.shippingCost) + Number(lot.taxCost) + Number(lot.customsCost) + Number(lot.otherCost);
                const landedPerUnit = units > 0 ? landedTotal / units : 0;
                return (
                  <tr key={lot.id} className="border-b border-slate-200">
                    <td className="px-2 py-2 font-medium">
                      <span className="flex items-center gap-1">
                        <BookmarkButton lotId={lot.id} bookmarked={lot.bookmarks.length > 0} action={toggleBookmark} />
                        {lot.lotNumber}
                      </span>
                    </td>
                    <td className="px-2 py-2"><EntityLink kind="supplier" id={lot.supplierId}>{lot.supplier.name}</EntityLink></td>
                    <td className="px-2 py-2">{lot.purchaseDate.toISOString().slice(0, 10)}</td>
                    <td className="px-2 py-2">{units}</td>
                    <td className="px-2 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${lot.status === "Cleared" ? "bg-sky-100 text-sky-800" : lot.status === "Shipped" ? "bg-indigo-100 text-indigo-800" : "bg-slate-200 text-slate-700"}`}>{lot.status}</span>
                    </td>
                    <td className="px-2 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${lot.paymentStatus === "Paid" ? "bg-green-100 text-green-800" : lot.paymentStatus === "Partial" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>{lot.paymentStatus}</span>
                    </td>
                    {showCost ? <td className="px-2 py-2">{formatMoney(landedPerUnit)}</td> : null}
                    {showCost ? <td className="px-2 py-2">{formatMoney(lotTotalCost(lot))}</td> : null}
                    {showCost ? <td className="px-2 py-2"><LotFxAmount lkr={lotTotalCost(lot)} /></td> : null}
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <Link href={`/lots/${lot.id}`} className="text-slate-800 underline">View</Link>
                        {deleteButton(lot)}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!lots.length ? (
                <tr>
                  <td className="px-2 py-5 text-slate-600" colSpan={showCost ? 10 : 7}>
                    No lots created yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
      )}
      </LotFxConverterSlot>
      <Pagination page={page} pageSize={pageSize} total={total} query={{ ...(search ? { search } : {}), ...(imeiQuery ? { imei: imeiQuery } : {}), ...(fromDate ? { from: fromDate } : {}), ...(toDate ? { to: toDate } : {}), ...(bookmarkedOnly ? { bookmarked: "1" } : {}), view }} />
    </div>
  );
}

function LotFxConverterSlot({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  return enabled ? <LotFxConverter>{children}</LotFxConverter> : <>{children}</>;
}
