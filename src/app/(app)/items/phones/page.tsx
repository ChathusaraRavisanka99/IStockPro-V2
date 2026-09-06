import { revalidatePath } from "next/cache";
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

type Props = { searchParams: { search?: string; filter?: string; view?: "list" | "grid"; page?: string; pageSize?: string; editModel?: string } };

export default async function PhonesPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  const showCost = canViewCost(session?.user?.role as "admin" | "manager" | "staff" | undefined);
  const search = searchParams.search?.trim() || "";
  const status = searchParams.filter || "";
  const view = searchParams.view === "grid" ? "grid" : "list";
  const page = parsePage(searchParams.page);
  const pageSize = parsePageSize(searchParams.pageSize);
  const editModelId = searchParams.editModel || "";

  const [models, variants, lots, suppliers] = await Promise.all([
    prisma.phoneModel.findMany({
      where: { deletedAt: null },
      orderBy: [{ brand: "asc" }, { modelName: "asc" }],
      include: {
        variants: {
          include: {
            _count: {
              select: {
                phones: {
                    where: { deletedAt: null, ...(status ? { status: status as "InStock" | "Reserved" | "Sold" | "Returned" | "Repair" | "WrittenOff" } : {}), ...(search ? { OR: [{ imei: { contains: search } }, { serialNumber: { contains: search } }] } : {}) },
                },
              },
            },
          },
        },
      },
    }),
    prisma.phoneVariant.findMany({
      where: { deletedAt: null, phoneModel: { deletedAt: null } },
      orderBy: [{ phoneModel: { brand: "asc" } }, { variantName: "asc" }],
      include: { phoneModel: true },
    }),
    prisma.lot.findMany({ where: { deletedAt: null }, orderBy: { purchaseDate: "desc" } }),
    prisma.supplier.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
  ]);

  const phoneWhere = {
    deletedAt: null,
    ...(status ? { status: status as "InStock" | "Reserved" | "Sold" | "Returned" | "Repair" | "WrittenOff" } : {}),
    ...(search ? { OR: [{ imei: { contains: search } }, { serialNumber: { contains: search } }] } : {}),
  };
  const [phones, phoneTotal] = showCost
    ? await prisma.$transaction([prisma.phone.findMany({ where: phoneWhere, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { phoneVariant: { include: { phoneModel: true } }, lot: true } }), prisma.phone.count({ where: phoneWhere })])
    : await prisma.$transaction([prisma.phone.findMany({ where: phoneWhere, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select: { id: true, imei: true, status: true, grade: true, batteryHealth: true, notes: true, createdAt: true, phoneVariant: { include: { phoneModel: true } }, lot: true } }), prisma.phone.count({ where: phoneWhere })]);

  async function createModel(formData: FormData) {
    "use server";

    const brand = String(formData.get("brand") || "").trim();
    const modelName = String(formData.get("modelName") || "").trim();
    const lowStockThreshold = Number(formData.get("lowStockThreshold") || 1);
    const warrantyMonths = Number(formData.get("warrantyMonths") || 0);

    if (!brand || !modelName) return;

    await prisma.phoneModel.create({
      data: {
        brand,
        modelName,
        lowStockThreshold,
        warrantyMonths,
      },
    });

    revalidatePath("/items/phones");
  }

  async function updateModel(formData: FormData) {
    "use server";

    const id = String(formData.get("id") || "");
    const brand = String(formData.get("brand") || "").trim();
    const modelName = String(formData.get("modelName") || "").trim();
    const lowStockThreshold = Number(formData.get("lowStockThreshold") || 0);
    const warrantyMonths = Number(formData.get("warrantyMonths") || 0);
    if (!id || !brand || !modelName) return;

    await prisma.phoneModel.update({ where: { id }, data: { brand, modelName, lowStockThreshold, warrantyMonths } });

    revalidatePath("/items/phones");
    revalidatePath("/items/phone-catalog");
    revalidatePath("/dashboard");
  }

  async function createVariant(formData: FormData) {
    "use server";

    const phoneModelId = String(formData.get("phoneModelId") || "");
    const variantName = String(formData.get("variantName") || "").trim();
    const color = String(formData.get("color") || "").trim() || null;
    const storage = String(formData.get("storage") || "").trim() || null;
    const ram = String(formData.get("ram") || "").trim() || null;
    const screenSize = String(formData.get("screenSize") || "").trim() || null;
    const processor = String(formData.get("processor") || "").trim() || null;
    const camera = String(formData.get("camera") || "").trim() || null;
    const os = String(formData.get("os") || "").trim() || null;
    const networkType = String(formData.get("networkType") || "").trim() || null;
    const battery = String(formData.get("battery") || "").trim() || null;

    if (!phoneModelId || !variantName) return;

    await prisma.phoneVariant.create({
      data: {
        phoneModelId,
        variantName,
        color,
        storage,
        ram,
        screenSize,
        processor,
        camera,
        os,
        networkType,
        battery,
      },
    });

    revalidatePath("/items/phones");
  }

  async function createPhoneUnit(formData: FormData) {
    "use server";

    const phoneVariantId = String(formData.get("phoneVariantId") || "");
    const lotId = String(formData.get("lotId") || "");
    const imei = String(formData.get("imei") || "").trim();
    const purchasePrice = Number(formData.get("purchasePrice") || 0);
    const wholesalePrice = Number(formData.get("wholesalePrice") || 0);
    const retailPrice = Number(formData.get("retailPrice") || 0);
    const gradeInput = String(formData.get("grade") || "");
    const grade = (["A", "B", "C"].includes(gradeInput) ? gradeInput : null) as "A" | "B" | "C" | null;
    const batteryHealthInput = String(formData.get("batteryHealth") || "").trim();
    const batteryHealth = batteryHealthInput ? Math.max(0, Math.min(100, Number(batteryHealthInput))) : null;
    const notes = String(formData.get("notes") || "").trim() || null;

    if (!phoneVariantId || !lotId || !imei) return;

    await prisma.phone.create({
      data: {
        phoneVariantId,
        lotId,
        imei,
        purchasePrice,
        wholesalePrice,
        retailPrice,
        grade,
        batteryHealth,
        notes,
      },
    });

    revalidatePath("/items/phones");
  }

  async function createLotDependency(formData: FormData) {
    "use server";
    const lotNumber = String(formData.get("lotNumber") || "").trim();
    const supplierId = String(formData.get("supplierId") || "");
    if (!lotNumber || !supplierId) return;
    await prisma.lot.create({ data: { lotNumber, supplierId, purchaseDate: new Date() } });
    revalidatePath("/items/phones");
  }

  async function archivePhone(formData: FormData) {
    "use server";
    const id = String(formData.get("id") || "");
    if (!id) return;
    await prisma.phone.update({ where: { id }, data: { deletedAt: new Date() } });
    revalidatePath("/items/phones");
  }

  return (
    <div>
      <PageHeader title="Items - Phones" subtitle="Serialized inventory with IMEI and stock counts" />
      <ListControls search={search} filter={status} view={view} placeholder="Search by IMEI or serial number" filterLabel="All statuses" filterOptions={["InStock", "Reserved", "Sold", "Returned", "Repair", "WrittenOff"].map((value) => ({ label: value, value }))} />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Add Phone Model</h2>
          <form action={createModel} className="grid gap-2">
            <input name="brand" required placeholder="Brand" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
            <input name="modelName" required placeholder="Model name" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
            <div className="grid grid-cols-2 gap-2">
              <label className="grid min-w-0 gap-1 text-sm text-slate-700">
                Low stock threshold
                <input name="lowStockThreshold" type="number" min={0} defaultValue={3} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
              </label>
              <label className="grid min-w-0 gap-1 text-sm text-slate-700">
                Warranty (months)
                <input name="warrantyMonths" type="number" min={0} defaultValue={0} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
              </label>
            </div>
            <button className="rounded-lg bg-slate-900 px-3 py-2 text-white">Create Model</button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-semibold">Add Variant</h2>
          <form action={createVariant} className="grid gap-2">
            <SearchableSelect
              name="phoneModelId"
              required
              placeholder="Select model"
              options={models.map((model) => ({ value: model.id, label: `${model.brand} ${model.modelName}` }))}
              quickAdd={{ label: "Model", action: createModel, fields: [{ name: "brand", label: "Brand", required: true }, { name: "modelName", label: "Model name", required: true }, { name: "lowStockThreshold", label: "Low stock threshold", type: "number" }, { name: "warrantyMonths", label: "Warranty months", type: "number" }] }}
            />
            <input name="variantName" required placeholder="Variant name" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input name="color" placeholder="Color" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
              <input name="storage" placeholder="Storage (ROM)" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
              <input name="ram" placeholder="RAM" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input name="screenSize" placeholder="Screen size" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
              <input name="processor" placeholder="Processor" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
              <input name="camera" placeholder="Camera" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input name="os" placeholder="OS" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
              <input name="networkType" placeholder="Network (4G/5G)" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
              <input name="battery" placeholder="Battery capacity" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
            </div>
            <button className="rounded-lg bg-slate-900 px-3 py-2 text-white">Create Variant</button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-semibold">Add Phone Unit</h2>
          <form action={createPhoneUnit} className="grid gap-2">
            <input name="imei" required placeholder="IMEI" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
            <SearchableSelect name="phoneVariantId" required placeholder="Select variant" options={variants.map((variant) => ({ value: variant.id, label: `${variant.phoneModel.brand} ${variant.phoneModel.modelName} - ${variant.variantName}` }))} />
            <SearchableSelect
              name="lotId"
              required
              placeholder="Select lot"
              options={lots.map((lot) => ({ value: lot.id, label: lot.lotNumber }))}
              quickAdd={{ label: "Lot", action: createLotDependency, fields: [{ name: "lotNumber", label: "Lot number", required: true }, { name: "supplierId", label: "Supplier", type: "select", required: true, options: suppliers.map((supplier) => ({ label: supplier.name, value: supplier.id })) }] }}
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <select name="grade" defaultValue="A" className="rounded-lg border border-slate-300 bg-white px-3 py-2">
                <option value="A">Grade A</option>
                <option value="B">Grade B</option>
                <option value="C">Grade C</option>
              </select>
              <input name="batteryHealth" type="number" min={0} max={100} placeholder="Battery health %" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
            </div>
            <input name="notes" placeholder="Notes (shown to staff when selecting this unit in a sale)" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
            {showCost ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <label className="grid min-w-0 gap-1 text-sm text-slate-700">
                  Purchase price
                  <input name="purchasePrice" type="number" step="0.01" min={0} defaultValue={0} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
                </label>
                <label className="grid min-w-0 gap-1 text-sm text-slate-700">
                  Wholesale price
                  <input name="wholesalePrice" type="number" step="0.01" min={0} defaultValue={0} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
                </label>
                <label className="grid min-w-0 gap-1 text-sm text-slate-700">
                  Retail price
                  <input name="retailPrice" type="number" step="0.01" min={0} defaultValue={0} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
                </label>
              </div>
            ) : null}
            <button className="rounded-lg bg-slate-900 px-3 py-2 text-white">Create Unit</button>
          </form>
        </Card>
      </div>

      <Card className="mt-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Models and In-Stock Counts</h2>
          <Link href="/items/phone-catalog" className="text-sm text-slate-700 underline">View full catalog</Link>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {models.map((model) => (
            <div key={model.id} className="rounded-xl border border-slate-300 bg-white px-4 py-3">
              {editModelId === model.id ? (
                <form action={updateModel} className="grid gap-2">
                  <input type="hidden" name="id" value={model.id} />
                  <div className="grid grid-cols-2 gap-2">
                    <label className="grid min-w-0 gap-1 text-xs text-slate-600">
                      Brand
                      <input name="brand" required defaultValue={model.brand} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
                    </label>
                    <label className="grid min-w-0 gap-1 text-xs text-slate-600">
                      Model name
                      <input name="modelName" required defaultValue={model.modelName} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="grid min-w-0 gap-1 text-xs text-slate-600">
                      Low stock threshold
                      <input name="lowStockThreshold" type="number" min={0} defaultValue={model.lowStockThreshold} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
                    </label>
                    <label className="grid min-w-0 gap-1 text-xs text-slate-600">
                      Warranty (months)
                      <input name="warrantyMonths" type="number" min={0} defaultValue={model.warrantyMonths} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" />
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="rounded-md bg-slate-900 px-3 py-1 text-xs text-white">Save</button>
                    <a href={`?${new URLSearchParams({ ...searchParams, editModel: "" }).toString()}`} className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700">Cancel</a>
                  </div>
                </form>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {model.brand} {model.modelName}
                    </p>
                    <p className="text-xs text-slate-600">Warranty {model.warrantyMonths} months | Threshold {model.lowStockThreshold}</p>
                  </div>
                  <a href={`?${new URLSearchParams({ ...searchParams, editModel: model.id }).toString()}`} className="shrink-0 text-xs text-slate-700 underline">
                    Edit
                  </a>
                </div>
              )}
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {model.variants.map((variant) => (
                  <li key={variant.id}>
                    <Link href={`/items/phones/variants/${variant.id}`} className="underline hover:text-slate-900">
                      {variant.variantName} - In stock: {variant._count.phones}
                    </Link>
                  </li>
                ))}
                {!model.variants.length ? <li>No variants yet.</li> : null}
              </ul>
            </div>
          ))}
          {!models.length ? <p className="text-sm text-slate-600">No models created yet.</p> : null}
        </div>
      </Card>
      <Pagination page={page} pageSize={pageSize} total={phoneTotal} query={{ ...(search ? { search } : {}), ...(status ? { filter: status } : {}), view }} />

      <Card className="mt-4">
        <h2 className="mb-3 text-lg font-semibold">Recent Serialized Units</h2>
        {view === "grid" ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {phones.map((phone) => (
              <div key={phone.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-slate-900">{phone.phoneVariant.phoneModel.brand} {phone.phoneVariant.phoneModel.modelName}</p>
                  <span className="rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-700">{phone.status}</span>
                </div>
                <p className="text-sm text-slate-700">{phone.phoneVariant.variantName}</p>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
                  <div className="flex justify-between gap-2"><dt>IMEI</dt><dd className="text-right text-slate-800">{phone.imei}</dd></div>
                  <div className="flex justify-between gap-2"><dt>Lot</dt><dd className="text-right text-slate-800">{phone.lot.lotNumber}</dd></div>
                  <div className="flex justify-between gap-2"><dt>Grade</dt><dd className="text-right text-slate-800">{phone.grade || "-"}</dd></div>
                  {showCost ? <div className="flex justify-between gap-2"><dt>Purchase price</dt><dd className="text-right text-slate-800">${Number((phone as { purchasePrice?: number }).purchasePrice ?? 0).toFixed(2)}</dd></div> : null}
                </dl>
                {phone.notes ? <p className="mt-2 text-xs italic text-slate-500">{phone.notes}</p> : null}
                <form action={archivePhone} className="mt-3">
                  <input type="hidden" name="id" value={phone.id} />
                  <button className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700">Archive</button>
                </form>
              </div>
            ))}
            {!phones.length ? <p className="text-sm text-slate-600">No serialized units match these filters.</p> : null}
          </div>
        ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-slate-700">
                <th className="px-2 py-2">IMEI</th>
                <th className="px-2 py-2">Model</th>
                <th className="px-2 py-2">Variant</th>
                <th className="px-2 py-2">Lot</th>
                <th className="px-2 py-2">Grade</th>
                <th className="px-2 py-2">Status</th>
                {showCost ? <th className="px-2 py-2">Purchase Price</th> : null}
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {phones.map((phone) => (
                <tr key={phone.id} className="border-b border-slate-200">
                  <td className="px-2 py-2">
                    {phone.imei}
                    {phone.notes ? <p className="mt-0.5 text-xs italic text-slate-500">{phone.notes}</p> : null}
                  </td>
                  <td className="px-2 py-2">{phone.phoneVariant.phoneModel.brand + " " + phone.phoneVariant.phoneModel.modelName}</td>
                  <td className="px-2 py-2">{phone.phoneVariant.variantName}</td>
                  <td className="px-2 py-2">{phone.lot.lotNumber}</td>
                  <td className="px-2 py-2">{phone.grade || "-"}</td>
                  <td className="px-2 py-2">{phone.status}</td>
                  {showCost ? <td className="px-2 py-2">${Number((phone as { purchasePrice?: number }).purchasePrice ?? 0).toFixed(2)}</td> : null}
                  <td className="px-2 py-2"><form action={archivePhone}><input type="hidden" name="id" value={phone.id} /><button className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700">Archive</button></form></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </Card>
    </div>
  );
}
