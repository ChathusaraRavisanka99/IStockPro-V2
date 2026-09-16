import { revalidatePath } from "next/cache";
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
import { ModelCardEditor } from "@/components/items/model-card-editor";
import { CostRow, CostCard } from "@/components/ui/cost-breakdown-modal";
import { NoModalCell, NoModalDiv } from "@/components/ui/no-modal-cell";
import type { ActionResult } from "@/components/ui/editable-row";

type Props = { searchParams: { search?: string; filter?: string; view?: "list" | "grid"; page?: string; pageSize?: string } };

export default async function PhonesPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  const showCost = canViewCost(session?.user?.role as "admin" | "manager" | "staff" | undefined);
  const search = searchParams.search?.trim() || "";
  const status = searchParams.filter || "";
  const view = searchParams.view === "grid" ? "grid" : "list";
  const page = parsePage(searchParams.page);
  const pageSize = parsePageSize(searchParams.pageSize);

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

  // Expenses (and the popup they feed) are cost-sensitive, so only fetch/show them for
  // roles that can already view cost — matches the Purchase Price column gating below.
  const expenseRows = showCost ? await prisma.expense.findMany({ where: { phoneId: { in: phones.map((phone) => phone.id) } }, orderBy: { expenseDate: "desc" } }) : [];
  const expensesByPhone = new Map<string, typeof expenseRows>();
  for (const expense of expenseRows) {
    if (!expense.phoneId) continue;
    const list = expensesByPhone.get(expense.phoneId) ?? [];
    list.push(expense);
    expensesByPhone.set(expense.phoneId, list);
  }

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

  async function updateModel(formData: FormData): Promise<ActionResult> {
    "use server";

    const id = String(formData.get("id") || "");
    const brand = String(formData.get("brand") || "").trim();
    const modelName = String(formData.get("modelName") || "").trim();
    const lowStockThreshold = Number(formData.get("lowStockThreshold") || 0);
    const warrantyMonths = Number(formData.get("warrantyMonths") || 0);
    if (!id || !brand || !modelName) return { ok: false, error: "Brand and model name are required." };

    await prisma.phoneModel.update({ where: { id }, data: { brand, modelName, lowStockThreshold, warrantyMonths } });

    revalidatePath("/items/phones");
    revalidatePath("/items/phone-catalog");
    revalidatePath("/dashboard");
    return { ok: true };
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
      <PageHeader
        title="Items - Phones"
        subtitle="Serialized inventory with IMEI and stock counts"
        help={
          <>
            <p>Phones are tracked at three levels: Model (e.g. iPhone 13), Variant (a specific color/storage/RAM combo), and Unit (one physical phone with its own IMEI).</p>
            <p className="mt-2">Most units come in automatically when you register phones on a lot&apos;s page — the three forms below are for one-off additions or setting up a new model/variant ahead of time.</p>
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <h2 className="mb-3 flex items-center gap-1.5 text-lg font-semibold">
            Add Phone Model
            <InfoHelp size="sm" title="Add Phone Model">
              A model is the phone family (brand + model name), e.g. &quot;Apple iPhone 13&quot;. Set its low-stock threshold and warranty period here — these apply to every variant under it.
            </InfoHelp>
          </h2>
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
          <h2 className="mb-3 flex items-center gap-1.5 text-lg font-semibold">
            Add Variant
            <InfoHelp size="sm" title="Add Variant">
              A variant is a specific configuration of a model — color, storage, RAM, and the rest of its specs. Every physical unit you register belongs to one variant.
            </InfoHelp>
          </h2>
          <form action={createVariant} className="grid gap-2">
            <SearchableSelect
              name="phoneModelId"
              required
              placeholder="Select model"
              options={models.map((model) => ({ value: model.id, label: `${model.brand} ${model.modelName}` }))}
              quickAdd={{ label: "Model", action: createModel, fields: [{ name: "brand", label: "Brand", required: true }, { name: "modelName", label: "Model name", required: true }, { name: "lowStockThreshold", label: "Low stock threshold", type: "number" }, { name: "warrantyMonths", label: "Warranty months", type: "number" }] }}
            />
            <input name="variantName" required placeholder="Variant name" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input name="color" placeholder="Color" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
              <input name="storage" placeholder="Storage (ROM)" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
              <input name="ram" placeholder="RAM" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input name="screenSize" placeholder="Screen size" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
              <input name="processor" placeholder="Processor" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
              <input name="camera" placeholder="Camera" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input name="os" placeholder="OS" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
              <input name="networkType" placeholder="Network (4G/5G)" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
              <input name="battery" placeholder="Battery capacity" className="rounded-lg border border-slate-300 bg-white px-3 py-2" />
            </div>
            <button className="rounded-lg bg-slate-900 px-3 py-2 text-white">Create Variant</button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-3 flex items-center gap-1.5 text-lg font-semibold">
            Add Phone Unit
            <InfoHelp size="sm" title="Add Phone Unit">
              Registers one physical phone by IMEI against a variant and a lot. Prefer adding units from the lot&apos;s own page when you&apos;re receiving a batch — use this only for a single one-off addition.
            </InfoHelp>
          </h2>
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
            <div className="grid grid-cols-1 gap-2">
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
          <h2 className="flex items-center gap-1.5 text-lg font-semibold">
            Models and In-Stock Counts
            <InfoHelp size="sm" title="Models and In-Stock Counts">
              Every model you&apos;ve created, with its variants and how many units of each are currently in stock. Use Edit on a model to change its details, or click a variant to drill into its individual units.
            </InfoHelp>
          </h2>
          <Link href="/items/phone-catalog" className="text-sm text-slate-700 underline">View full catalog</Link>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {models.map((model) => (
            <ModelCardEditor key={model.id} model={model} updateAction={updateModel} />
          ))}
          {!models.length ? <p className="text-sm text-slate-600">No models created yet.</p> : null}
        </div>
      </Card>

      <ListControls search={search} filter={status} view={view} placeholder="Search by IMEI or serial number" filterLabel="All statuses" filterOptions={["InStock", "Reserved", "Sold", "Returned", "Repair", "WrittenOff"].map((value) => ({ label: value, value }))} />

      <Card className="mt-4">
        <h2 className="mb-3 flex items-center gap-1.5 text-lg font-semibold">
          Recent Serialized Units
          <InfoHelp size="sm" title="Recent Serialized Units">
            Individual phones by IMEI, filtered and searched with the bar above. Archiving a unit here removes it from active stock without deleting its history.
          </InfoHelp>
        </h2>
        {view === "grid" ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {phones.map((phone) => {
              const costFields = phone as unknown as { purchasePrice?: unknown; wholesalePrice?: unknown; retailPrice?: unknown; tagCost?: unknown; batteryCost?: unknown };
              const purchasePrice = Number(costFields.purchasePrice ?? 0);
              const totalCost = purchasePrice + Number(costFields.tagCost ?? 0) + Number(costFields.batteryCost ?? 0);
              const cardBody = (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-slate-900">{phone.phoneVariant.phoneModel.brand} {phone.phoneVariant.phoneModel.modelName}</p>
                    <span className="rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-700">{phone.status}</span>
                  </div>
                  <p className="text-sm text-slate-700">{phone.phoneVariant.variantName}</p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
                    <div className="flex justify-between gap-2"><dt>IMEI</dt><dd className="text-right text-slate-800">{phone.imei}</dd></div>
                    <div className="flex justify-between gap-2"><dt>Lot</dt><dd className="text-right text-slate-800">{phone.lot.lotNumber}</dd></div>
                    <div className="flex justify-between gap-2"><dt>Grade</dt><dd className="text-right text-slate-800">{phone.grade || "-"}</dd></div>
                    {showCost ? <div className="flex justify-between gap-2"><dt>Purchase price</dt><dd className="text-right text-slate-800">{formatMoney(purchasePrice)}</dd></div> : null}
                  </dl>
                  {phone.notes ? <p className="mt-2 text-xs italic text-slate-500">{phone.notes}</p> : null}
                  <NoModalDiv className="mt-3">
                    <form action={archivePhone}>
                      <input type="hidden" name="id" value={phone.id} />
                      <button className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700">Archive</button>
                    </form>
                  </NoModalDiv>
                </>
              );
              if (!showCost) {
                return (
                  <div key={phone.id} className="rounded-xl border border-slate-200 p-3">
                    {cardBody}
                  </div>
                );
              }
              return (
                <CostCard
                  key={phone.id}
                  className="rounded-xl border border-slate-200 p-3"
                  data={{
                    name: `${phone.phoneVariant.phoneModel.brand} ${phone.phoneVariant.phoneModel.modelName} - ${phone.phoneVariant.variantName} - IMEI ${phone.imei}`,
                    unitCost: purchasePrice,
                    totalCost,
                    wholesalePrice: Number(costFields.wholesalePrice ?? 0),
                    retailPrice: Number(costFields.retailPrice ?? 0),
                    details: [
                      { label: "Model", value: `${phone.phoneVariant.phoneModel.brand} ${phone.phoneVariant.phoneModel.modelName}` },
                      { label: "Variant", value: phone.phoneVariant.variantName },
                      { label: "IMEI", value: phone.imei },
                      { label: "Status", value: phone.status },
                      { label: "Grade", value: phone.grade || "Not Graded" },
                      { label: "Lot", value: phone.lot.lotNumber },
                      ...(phone.notes ? [{ label: "Notes", value: phone.notes }] : []),
                    ],
                    expenses: (expensesByPhone.get(phone.id) ?? []).map((expense) => ({
                      label: expense.category + (expense.description ? ` — ${expense.description}` : ""),
                      amount: Number(expense.amount),
                      date: expense.expenseDate.toISOString().slice(0, 10),
                    })),
                  }}
                >
                  {cardBody}
                </CostCard>
              );
            })}
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
              {phones.map((phone) => {
                const costFields = phone as unknown as { purchasePrice?: unknown; wholesalePrice?: unknown; retailPrice?: unknown; tagCost?: unknown; batteryCost?: unknown };
                const purchasePrice = Number(costFields.purchasePrice ?? 0);
                const totalCost = purchasePrice + Number(costFields.tagCost ?? 0) + Number(costFields.batteryCost ?? 0);
                const rowCells = (
                  <>
                    <td className="px-2 py-2">
                      {phone.imei}
                      {phone.notes ? <p className="mt-0.5 text-xs italic text-slate-500">{phone.notes}</p> : null}
                    </td>
                    <td className="px-2 py-2">{phone.phoneVariant.phoneModel.brand + " " + phone.phoneVariant.phoneModel.modelName}</td>
                    <td className="px-2 py-2">{phone.phoneVariant.variantName}</td>
                    <td className="px-2 py-2">{phone.lot.lotNumber}</td>
                    <td className="px-2 py-2">{phone.grade || "-"}</td>
                    <td className="px-2 py-2">{phone.status}</td>
                    {showCost ? <td className="px-2 py-2">{formatMoney(purchasePrice)}</td> : null}
                    <NoModalCell className="px-2 py-2"><form action={archivePhone}><input type="hidden" name="id" value={phone.id} /><button className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700">Archive</button></form></NoModalCell>
                  </>
                );
                if (!showCost) {
                  return <tr key={phone.id} className="border-b border-slate-200">{rowCells}</tr>;
                }
                return (
                  <CostRow
                    key={phone.id}
                    className="border-b border-slate-200"
                    data={{
                      name: `${phone.phoneVariant.phoneModel.brand} ${phone.phoneVariant.phoneModel.modelName} - ${phone.phoneVariant.variantName} - IMEI ${phone.imei}`,
                      unitCost: purchasePrice,
                      totalCost,
                      wholesalePrice: Number(costFields.wholesalePrice ?? 0),
                      retailPrice: Number(costFields.retailPrice ?? 0),
                      details: [
                        { label: "Model", value: `${phone.phoneVariant.phoneModel.brand} ${phone.phoneVariant.phoneModel.modelName}` },
                        { label: "Variant", value: phone.phoneVariant.variantName },
                        { label: "IMEI", value: phone.imei },
                        { label: "Status", value: phone.status },
                        { label: "Grade", value: phone.grade || "Not Graded" },
                        { label: "Lot", value: phone.lot.lotNumber },
                        ...(phone.notes ? [{ label: "Notes", value: phone.notes }] : []),
                      ],
                      expenses: (expensesByPhone.get(phone.id) ?? []).map((expense) => ({
                        label: expense.category + (expense.description ? ` — ${expense.description}` : ""),
                        amount: Number(expense.amount),
                        date: expense.expenseDate.toISOString().slice(0, 10),
                      })),
                    }}
                  >
                    {rowCells}
                  </CostRow>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
      </Card>
      <Pagination page={page} pageSize={pageSize} total={phoneTotal} query={{ ...(search ? { search } : {}), ...(status ? { filter: status } : {}), view }} />
    </div>
  );
}
