import { revalidatePath } from "next/cache";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { ListControls } from "@/components/ui/list-controls";
import { Pagination } from "@/components/ui/pagination";
import { parsePage, parsePageSize } from "@/lib/pagination";
import { formatMoney } from "@/lib/currency";

type SpecField = "connectorType" | "voltage" | "fastCharging";

type Props = {
  title: string;
  category: string;
  route: string;
  specFields?: SpecField[];
  connectorPlaceholder?: string;
  searchParams?: { search?: string; view?: "list" | "grid"; page?: string; pageSize?: string; edit?: string };
};

const DEFAULT_SPEC_FIELDS: SpecField[] = ["connectorType", "voltage", "fastCharging"];

export async function AccessoryCategoryPage({
  title,
  category,
  route,
  specFields = DEFAULT_SPEC_FIELDS,
  connectorPlaceholder = "Connector type (e.g. USB-C, Micro-USB)",
  searchParams = {},
}: Props) {
  const showConnectorType = specFields.includes("connectorType");
  const showVoltage = specFields.includes("voltage");
  const showFastCharging = specFields.includes("fastCharging");
  const search = searchParams.search?.trim() || "";
  const view = searchParams.view === "grid" ? "grid" : "list";
  const page = parsePage(searchParams.page);
  const pageSize = parsePageSize(searchParams.pageSize);
  const editId = searchParams.edit || "";
  const where = { category, deletedAt: null, ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { sku: { contains: search, mode: "insensitive" as const } }] } : {}) };
  const [accessories, total] = await prisma.$transaction([
    prisma.accessory.findMany({
    where,
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: { createdAt: "desc" },
  }), prisma.accessory.count({ where })]);

  async function createAccessory(formData: FormData) {
    "use server";

    const name = String(formData.get("name") || "").trim();
    const sku = String(formData.get("sku") || "").trim();
    const quantity = Number(formData.get("quantity") || 0);
    const lowStockThreshold = Number(formData.get("lowStockThreshold") || 0);
    const purchasePrice = Number(formData.get("purchasePrice") || 0);
    const wholesalePrice = Number(formData.get("wholesalePrice") || 0);
    const retailPrice = Number(formData.get("retailPrice") || 0);
    const connectorType = String(formData.get("connectorType") || "").trim() || null;
    const fastCharging = formData.get("fastCharging") === "true";
    const voltage = String(formData.get("voltage") || "").trim() || null;
    const notes = String(formData.get("notes") || "").trim() || null;

    if (!name || !sku) {
      return;
    }

    await prisma.accessory.create({
      data: {
        name,
        sku,
        category,
        quantity,
        lowStockThreshold,
        purchasePrice,
        wholesalePrice,
        retailPrice,
        connectorType,
        fastCharging,
        voltage,
        notes,
      },
    });

    revalidatePath(route);
  }

  async function archiveAccessory(formData: FormData) {
    "use server";
    const id = String(formData.get("id") || "");
    if (!id) return;
    await prisma.accessory.update({ where: { id }, data: { deletedAt: new Date() } });
    revalidatePath(route);
  }

  async function updateAccessory(formData: FormData) {
    "use server";
    const id = String(formData.get("id") || "");
    const name = String(formData.get("name") || "").trim();
    const sku = String(formData.get("sku") || "").trim();
    if (!id || !name || !sku) return;

    await prisma.accessory.update({
      where: { id },
      data: {
        name,
        sku,
        lowStockThreshold: Number(formData.get("lowStockThreshold") || 0),
        purchasePrice: Number(formData.get("purchasePrice") || 0),
        wholesalePrice: Number(formData.get("wholesalePrice") || 0),
        retailPrice: Number(formData.get("retailPrice") || 0),
      },
    });

    revalidatePath(route);
  }

  return (
    <div>
      <PageHeader title={title} subtitle="Accessory inventory with quantity and low-stock tracking" />
      <ListControls search={search} view={view} placeholder="Search by accessory name or SKU" />

      <Card className="mb-4">
        <form action={createAccessory} className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
          <input name="name" placeholder="Name" className="rounded-lg border border-slate-300 bg-white px-3 py-2" required />
          <input name="sku" placeholder="SKU" className="rounded-lg border border-slate-300 bg-white px-3 py-2" required />
          <label className="grid min-w-0 gap-1 text-sm text-slate-700">
            Quantity
            <input name="quantity" type="number" className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" min={0} defaultValue={0} />
          </label>
          <label className="grid min-w-0 gap-1 text-sm text-slate-700">
            Low stock threshold
            <input name="lowStockThreshold" type="number" className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" min={0} defaultValue={5} />
          </label>
          <label className="grid min-w-0 gap-1 text-sm text-slate-700">
            Purchase price
            <input name="purchasePrice" type="number" step="0.01" className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" min={0} defaultValue={0} />
          </label>
          <label className="grid min-w-0 gap-1 text-sm text-slate-700">
            Wholesale price
            <input name="wholesalePrice" type="number" step="0.01" className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" min={0} defaultValue={0} />
          </label>
          <label className="grid min-w-0 gap-1 text-sm text-slate-700">
            Retail price
            <input name="retailPrice" type="number" step="0.01" className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" required min={0} defaultValue={0} />
          </label>
          {showConnectorType ? (
            <input name="connectorType" placeholder={connectorPlaceholder} className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          ) : null}
          {showVoltage ? (
            <input name="voltage" placeholder="Voltage (e.g. 5V/9V/12V)" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
          ) : null}
          {showFastCharging ? (
            <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
              <input name="fastCharging" type="checkbox" value="true" className="size-4" />
              Fast charging
            </label>
          ) : null}
          <input name="notes" placeholder="Notes (shown to staff when selecting this item in a sale)" className="rounded-lg border border-slate-300 bg-white px-3 py-2 md:col-span-2 xl:col-span-3" />
          <button className="rounded-lg bg-slate-900 px-3 py-2 text-white md:col-span-3 xl:col-span-4">Add</button>
        </form>
      </Card>

      {view === "grid" ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {accessories.map((item) => (
            <Card key={item.id}>
              <p className="font-semibold text-slate-900">{item.name}</p>
              <p className="mt-1 text-sm text-slate-700">{item.sku}</p>
              {item.connectorType || item.fastCharging || item.voltage ? (
                <p className="mt-1 text-xs text-slate-600">
                  {[item.connectorType, item.voltage, item.fastCharging ? "Fast charging" : null].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              <p className="mt-3 text-sm text-slate-700">{item.quantity} in stock | {formatMoney(Number(item.retailPrice))}</p>
              {item.notes ? <p className="mt-1 text-xs italic text-slate-500">{item.notes}</p> : null}
              <div className="mt-3 flex gap-2">
                <a href={`?${new URLSearchParams({ view: "list", edit: item.id }).toString()}`} className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-700">Edit</a>
                <form action={archiveAccessory}>
                  <input type="hidden" name="id" value={item.id} />
                  <button className="rounded-lg border border-red-200 px-3 py-1 text-sm text-red-700">Archive</button>
                </form>
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
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">SKU</th>
                <th className="px-2 py-2">Specs</th>
                <th className="px-2 py-2">Quantity</th>
                <th className="px-2 py-2">Sold</th>
                <th className="px-2 py-2">Low Stock Threshold</th>
                <th className="px-2 py-2">Purchase Price</th>
                <th className="px-2 py-2">Wholesale Price</th>
                <th className="px-2 py-2">Retail Price</th>
                  <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {accessories.map((item) =>
                editId === item.id ? (
                  <tr key={item.id} className="border-b border-slate-200 bg-slate-50">
                    <td className="px-2 py-2" colSpan={10}>
                      <form action={updateAccessory} className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                        <input type="hidden" name="id" value={item.id} />
                        <label className="grid min-w-0 gap-1 text-xs text-slate-600">
                          Name
                          <input name="name" required defaultValue={item.name} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
                        </label>
                        <label className="grid min-w-0 gap-1 text-xs text-slate-600">
                          SKU
                          <input name="sku" required defaultValue={item.sku} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
                        </label>
                        <label className="grid min-w-0 gap-1 text-xs text-slate-600">
                          Low stock threshold
                          <input name="lowStockThreshold" type="number" min={0} defaultValue={item.lowStockThreshold} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
                        </label>
                        <label className="grid min-w-0 gap-1 text-xs text-slate-600">
                          Purchase price
                          <input name="purchasePrice" type="number" step="0.01" min={0} defaultValue={Number(item.purchasePrice)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
                        </label>
                        <label className="grid min-w-0 gap-1 text-xs text-slate-600">
                          Wholesale price
                          <input name="wholesalePrice" type="number" step="0.01" min={0} defaultValue={Number(item.wholesalePrice)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
                        </label>
                        <label className="grid min-w-0 gap-1 text-xs text-slate-600">
                          Retail price
                          <input name="retailPrice" type="number" step="0.01" min={0} defaultValue={Number(item.retailPrice)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
                        </label>
                        <div className="flex items-end gap-2">
                          <button type="submit" className="rounded-md bg-slate-900 px-3 py-1 text-xs text-white">Save</button>
                          <a href="?" className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700">Cancel</a>
                        </div>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={item.id} className="border-b border-slate-200">
                    <td className="px-2 py-2">{item.name}</td>
                    <td className="px-2 py-2">{item.sku}</td>
                    <td className="px-2 py-2 text-xs text-slate-600">
                      {[item.connectorType, item.voltage, item.fastCharging ? "Fast charging" : null].filter(Boolean).join(" · ") || "-"}
                    </td>
                    <td className="px-2 py-2">{item.quantity}</td>
                    <td className="px-2 py-2">{item.soldQuantity}</td>
                    <td className="px-2 py-2">{item.lowStockThreshold}</td>
                    <td className="px-2 py-2">{formatMoney(Number(item.purchasePrice))}</td>
                    <td className="px-2 py-2">{formatMoney(Number(item.wholesalePrice))}</td>
                    <td className="px-2 py-2">{formatMoney(Number(item.retailPrice))}</td>
                    <td className="px-2 py-2">
                      <div className="flex gap-2">
                        <a href={`?${new URLSearchParams({ edit: item.id }).toString()}`} className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700">Edit</a>
                        <form action={archiveAccessory}><input type="hidden" name="id" value={item.id} /><button className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700">Archive</button></form>
                      </div>
                    </td>
                  </tr>
                )
              )}
              {!accessories.length ? (
                <tr>
                    <td className="px-2 py-5 text-slate-600" colSpan={10}>
                    No accessories in this category yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} query={{ ...(search ? { search } : {}), ...(view ? { view } : {}) }} />
    </div>
  );
}
