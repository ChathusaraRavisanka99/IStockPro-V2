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
import { NoModalCell, NoModalDiv, NoModalLink } from "@/components/ui/no-modal-cell";
import type { ActionResult } from "@/components/ui/editable-row";
import { createOrRestorePhoneVariant, deletePhoneVariant, softDeletePhoneModel } from "@/lib/phone-variants";
import { VariantPickerField, type CreateVariantResult } from "@/components/items/variant-picker";
import { compareSizes } from "@/lib/variant-specs";
import { formatPhoneName, formatVariantSpecs } from "@/lib/format-item-name";
import { TabPanels } from "@/components/ui/tab-panels";
import { UnitEditButton, UnitEditProvider, type EditableUnit } from "@/components/items/unit-edit";
import { editPhoneUnit } from "@/lib/phone-units";
import { findImeiOwner } from "@/lib/imei";
import { createPhoneExpense, expenseCategories, listPhoneExpenses } from "@/lib/unit-expenses";
import { GradeBadge, PriceMissing, SpecChips, StatusPill } from "@/components/ui/spec-chips";
import { Boxes, LineChart, Plus, Search, Smartphone, Wallet } from "lucide-react";
import { EntityLink } from "@/components/ui/entity-link";
import { withErrorLog } from "@/lib/error-log";

type Props = { searchParams: { search?: string; filter?: string; view?: "list" | "grid"; page?: string; pageSize?: string; options?: "all" | "stock"; model?: string } };

export default async function PhonesPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  const showCost = canViewCost(session?.user?.role as "admin" | "manager" | "staff" | undefined);
  const search = searchParams.search?.trim() || "";
  const status = searchParams.filter || "";
  const view = searchParams.view === "grid" ? "grid" : "list";
  const page = parsePage(searchParams.page);
  const pageSize = parsePageSize(searchParams.pageSize);
  // Model cards list color/storage/RAM options either for variants with stock, or all.
  const optionsMode = searchParams.options === "all" ? "all" : "stock";
  const modelQuery = searchParams.model?.trim() || "";

  const [models, variants, lots, suppliers] = await Promise.all([
    prisma.phoneModel.findMany({
      where: { deletedAt: null },
      orderBy: [{ brand: "asc" }, { modelName: "asc" }],
      include: {
        variants: {
          where: { deletedAt: null },
          orderBy: { variantName: "asc" },
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
      include: { phoneModel: true, _count: { select: { phones: { where: { deletedAt: null, status: "InStock" } } } } },
    }),
    prisma.lot.findMany({ where: { deletedAt: null }, orderBy: { purchaseDate: "desc" } }),
    prisma.supplier.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
  ]);
  const stockValue = await prisma.phone.aggregate({ _sum: { retailPrice: true, purchasePrice: true }, where: { deletedAt: null, status: "InStock" } });

  const phoneWhere = {
    deletedAt: null,
    ...(status ? { status: status as "InStock" | "Reserved" | "Sold" | "Returned" | "Repair" | "WrittenOff" } : {}),
    ...(search
      ? {
          OR: [
            { imei: { contains: search } },
            { serialNumber: { contains: search, mode: "insensitive" as const } },
            { phoneVariant: { variantName: { contains: search, mode: "insensitive" as const } } },
            { phoneVariant: { color: { contains: search, mode: "insensitive" as const } } },
            { phoneVariant: { phoneModel: { modelName: { contains: search, mode: "insensitive" as const } } } },
            { phoneVariant: { phoneModel: { brand: { contains: search, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
  };
  const [phones, phoneTotal] = showCost
    ? await prisma.$transaction([prisma.phone.findMany({ where: phoneWhere, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { phoneVariant: { include: { phoneModel: true } }, lot: true } }), prisma.phone.count({ where: phoneWhere })])
    : await prisma.$transaction([prisma.phone.findMany({ where: phoneWhere, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select: { id: true, imei: true, status: true, grade: true, retailPrice: true, batteryHealth: true, notes: true, createdAt: true, phoneVariant: { include: { phoneModel: true } }, lot: true } }), prisma.phone.count({ where: phoneWhere })]);

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

    if (!phoneModelId) return;

    await createOrRestorePhoneVariant({ phoneModelId, variantName, color, storage, ram, screenSize, processor, camera, os, networkType, battery });

    revalidatePath("/items/phones");
  }

  async function createVariantFromPicker(formData: FormData): Promise<CreateVariantResult> {
    "use server";
    const phoneModelId = String(formData.get("phoneModelId") || "");
    if (!phoneModelId) return { ok: false, error: "Select a model." };
    const text = (key: string) => String(formData.get(key) || "").trim() || null;
    const variant = await createOrRestorePhoneVariant({
      phoneModelId,
      variantName: String(formData.get("variantName") || ""),
      color: text("color"),
      storage: text("storage"),
      ram: text("ram"),
      screenSize: null,
      processor: null,
      camera: null,
      os: null,
      networkType: null,
      battery: null,
    });
    revalidatePath("/items/phones");
    return { ok: true, id: variant.id };
  }

  async function deleteModel(formData: FormData): Promise<ActionResult> {
    "use server";
    return softDeletePhoneModel(String(formData.get("id") || ""));
  }

  async function deleteVariant(formData: FormData): Promise<ActionResult> {
    "use server";
    return deletePhoneVariant(String(formData.get("id") || ""));
  }

  async function createPhoneUnit(formData: FormData) {
    "use server";
    return withErrorLog("items/phones: createPhoneUnit", formData, async () => {
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
      // Only live units count — an IMEI from a deleted unit may be registered again.
      if (await prisma.phone.findFirst({ where: { imei, deletedAt: null }, select: { id: true } })) return;

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
    });
  }

  async function createLotDependency(formData: FormData) {
    "use server";
    const lotNumber = String(formData.get("lotNumber") || "").trim();
    const supplierId = String(formData.get("supplierId") || "");
    if (!lotNumber || !supplierId) return;
    await prisma.lot.create({ data: { lotNumber, supplierId, purchaseDate: new Date() } });
    revalidatePath("/items/phones");
  }

  async function editUnit(formData: FormData): Promise<ActionResult> {
    "use server";
    const actor = await getServerSession(authOptions);
    const result = await editPhoneUnit(formData, {
      userId: actor?.user?.id,
      canEditCost: canViewCost(actor?.user?.role as "admin" | "manager" | "staff" | undefined),
    });
    if (result.ok) {
      revalidatePath("/items/phones");
      revalidatePath("/items/phone-catalog");
      revalidatePath("/items/phones/price-history");
      revalidatePath("/lots", "layout");
      revalidatePath("/dashboard");
      revalidatePath("/lots");
    }
    return result;
  }

  async function listUnitExpenses(phoneId: string) {
    "use server";
    const actor = await getServerSession(authOptions);
    if (!canViewCost(actor?.user?.role as "admin" | "manager" | "staff" | undefined)) return [];
    return listPhoneExpenses(phoneId);
  }

  async function addUnitExpense(formData: FormData) {
    "use server";
    const actor = await getServerSession(authOptions);
    if (!canViewCost(actor?.user?.role as "admin" | "manager" | "staff" | undefined)) return { ok: false as const, error: "Only admins and managers can record expenses." };
    const result = await createPhoneExpense(formData);
    if (result.ok) {
      revalidatePath("/expenses");
      revalidatePath("/items/phones");
    }
    return result;
  }

  async function checkImei(imei: string, phoneId: string) {
    "use server";
    return findImeiOwner(imei, phoneId);
  }

  async function archivePhone(formData: FormData) {
    "use server";
    const id = String(formData.get("id") || "");
    if (!id) return;
    await prisma.phone.update({ where: { id }, data: { deletedAt: new Date() } });
    revalidatePath("/items/phones");
  }

  const pickerVariants = variants.map((variant) => ({
    id: variant.id,
    phoneModelId: variant.phoneModelId,
    brand: variant.phoneModel.brand,
    modelName: variant.phoneModel.modelName,
    variantName: variant.variantName,
    color: variant.color,
    storage: variant.storage,
    ram: variant.ram,
    inStock: variant._count.phones,
  }));
  const inStockByVariant = new Map(variants.map((variant) => [variant.id, variant._count.phones]));
  const distinct = (values: (string | null)[], sizes = false) => {
    const list = Array.from(new Set(values.filter((value): value is string => Boolean(value))));
    return sizes ? list.sort(compareSizes) : list.sort((a, b) => a.localeCompare(b));
  };
  const optionsFor = (model: (typeof models)[number]) => {
    const pool = optionsMode === "all" ? model.variants : model.variants.filter((variant) => (inStockByVariant.get(variant.id) ?? 0) > 0);
    return { colors: distinct(pool.map((variant) => variant.color)), storages: distinct(pool.map((variant) => variant.storage), true), rams: distinct(pool.map((variant) => variant.ram), true) };
  };
  const optionsHref = (mode: "all" | "stock") => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) if (value && key !== "options") params.set(key, String(value));
    if (mode === "all") params.set("options", "all");
    const query = params.toString();
    return `/items/phones${query ? `?${query}` : ""}`;
  };

  const editableUnit = (phone: (typeof phones)[number]): EditableUnit => {
    const cost = phone as unknown as { purchasePrice?: unknown; wholesalePrice?: unknown; retailPrice?: unknown; tagCost?: unknown; batteryCost?: unknown };
    return {
      id: phone.id,
      imei: phone.imei,
      phoneVariantId: phone.phoneVariant.id,
      lotStatus: phone.lot.status,
      lotNumber: phone.lot.lotNumber,
      lotId: phone.lot.id,
      status: phone.status,
      grade: phone.grade,
      batteryHealth: phone.batteryHealth,
      notes: phone.notes,
      ...(showCost
        ? {
            prices: {
              purchasePrice: Number(cost.purchasePrice ?? 0),
              wholesalePrice: Number(cost.wholesalePrice ?? 0),
              retailPrice: Number(cost.retailPrice ?? 0),
              tagCost: Number(cost.tagCost ?? 0),
              batteryCost: Number(cost.batteryCost ?? 0),
            },
          }
        : {}),
    };
  };

  const inStockTotal = variants.reduce((sum, variant) => sum + variant._count.phones, 0);
  const inStockRecord = Object.fromEntries(variants.map((variant) => [variant.id, variant._count.phones]));
  const visibleModels = modelQuery
    ? models.filter((model) => `${model.brand} ${model.modelName} ${model.variants.map((variant) => `${variant.variantName} ${variant.color ?? ""} ${variant.storage ?? ""}`).join(" ")}`.toLowerCase().includes(modelQuery.toLowerCase()))
    : models;
  const inputClass = "w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  const labelClass = "grid min-w-0 gap-1 text-xs font-medium text-slate-600";
  const stats = [
    { label: "Models", value: String(models.length), icon: Smartphone },
    { label: "Variants", value: String(variants.length), icon: Boxes },
    { label: "Units in stock", value: String(inStockTotal), icon: LineChart },
    { label: "Stock retail value", value: formatMoney(Number(stockValue._sum.retailPrice ?? 0)), icon: Wallet },
  ];

  return (
    <div>
      <PageHeader
        title="Phones"
        subtitle="Serialized inventory with IMEI and stock counts"
        help={
          <>
            <p>Phones are tracked at three levels: Model (e.g. iPhone 13), Variant (a specific color/storage/RAM combo), and Unit (one physical phone with its own IMEI).</p>
            <p className="mt-2">Most units come in automatically when you register phones on a lot&apos;s page — the three forms below are for one-off additions or setting up a new model/variant ahead of time.</p>
          </>
        }
      />

      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <stat.icon className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs text-slate-500">{stat.label}</span>
              <span className="block truncate text-base font-semibold text-slate-900 sm:text-lg">{stat.value}</span>
            </span>
          </div>
        ))}
      </section>

      <Card className="mb-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-lg font-semibold">
            Quick add
            <InfoHelp size="sm" title="Quick add">
              <p>Phones are tracked at three levels: a <b>model</b> (e.g. Apple iPhone 13), its <b>variants</b> (storage → RAM → color, all optional) and <b>units</b> (one physical phone with its own IMEI).</p>
              <p>Receiving a batch? Register units on the lot&apos;s page instead — these forms are for one-off additions and setting things up ahead of time.</p>
            </InfoHelp>
          </h2>
        </div>
        <TabPanels
          tabs={[
            {
              id: "unit",
              label: "Phone unit",
              description: "Register one physical phone by IMEI against a variant and a lot.",
              content: (
                <form action={createPhoneUnit} className="grid gap-3 sm:grid-cols-2">
            <input name="imei" required placeholder="IMEI" className={inputClass} />
            <VariantPickerField
              name="phoneVariantId"
              variants={pickerVariants}
              create={{ action: createVariantFromPicker, models: models.map((model) => ({ id: model.id, label: `${model.brand} ${model.modelName}` })) }}
            />
            <SearchableSelect
              name="lotId"
              required
              placeholder="Select lot"
              options={lots.map((lot) => ({ value: lot.id, label: lot.lotNumber }))}
              quickAdd={{ label: "Lot", action: createLotDependency, fields: [{ name: "lotNumber", label: "Lot number", required: true }, { name: "supplierId", label: "Supplier", type: "select", required: true, options: suppliers.map((supplier) => ({ label: supplier.name, value: supplier.id })) }] }}
            />
            <div className="grid grid-cols-1 gap-2">
              <select name="grade" defaultValue="A" className={inputClass}>
                <option value="A">Grade A</option>
                <option value="B">Grade B</option>
                <option value="C">Grade C</option>
              </select>
              <input name="batteryHealth" type="number" min={0} max={100} placeholder="Battery health %" className={inputClass} />
            </div>
            <input name="notes" placeholder="Notes (shown to staff when selecting this unit in a sale)" className={inputClass} />
            {showCost ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <label className={labelClass}>
                  Purchase price
                  <input name="purchasePrice" type="number" step="0.01" min={0} defaultValue={0} className={inputClass} />
                </label>
                <label className={labelClass}>
                  Wholesale price
                  <input name="wholesalePrice" type="number" step="0.01" min={0} defaultValue={0} className={inputClass} />
                </label>
                <label className={labelClass}>
                  Retail price
                  <input name="retailPrice" type="number" step="0.01" min={0} defaultValue={0} className={inputClass} />
                </label>
              </div>
            ) : null}
            <button className="btn btn-md btn-primary justify-self-start"><Plus className="size-4" />Create Unit</button>
          </form>
              ),
            },
            {
              id: "variant",
              label: "Variant",
              description: "A configuration of a model: storage, RAM and color (all optional). Leave the name blank and it's built from them, e.g. \"128GB · Red\".",
              content: (
                <form action={createVariant} className="grid gap-2">
            <SearchableSelect
              name="phoneModelId"
              required
              placeholder="Select model"
              options={models.map((model) => ({ value: model.id, label: `${model.brand} ${model.modelName}` }))}
              quickAdd={{ label: "Model", action: createModel, fields: [{ name: "brand", label: "Brand", required: true }, { name: "modelName", label: "Model name", required: true }, { name: "lowStockThreshold", label: "Low stock threshold", type: "number" }, { name: "warrantyMonths", label: "Warranty months", type: "number" }] }}
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input name="storage" placeholder="Storage, e.g. 128GB" className={inputClass} />
              <input name="ram" placeholder="RAM, e.g. 6GB" className={inputClass} />
              <input name="color" placeholder="Color" className={inputClass} />
            </div>
            <input name="variantName" placeholder="Variant name (optional — built from storage/RAM/color)" className={inputClass} />
            <p className="text-xs text-slate-500">Model → storage → RAM → color. Everything after the model is optional.</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input name="screenSize" placeholder="Screen size" className={inputClass} />
              <input name="processor" placeholder="Processor" className={inputClass} />
              <input name="camera" placeholder="Camera" className={inputClass} />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input name="os" placeholder="OS" className={inputClass} />
              <input name="networkType" placeholder="Network (4G/5G)" className={inputClass} />
              <input name="battery" placeholder="Battery capacity" className={inputClass} />
            </div>
            <button className="btn btn-md btn-primary justify-self-start"><Plus className="size-4" />Create Variant</button>
          </form>
              ),
            },
            {
              id: "model",
              label: "Model",
              description: "The phone family (brand + model name). Its low-stock threshold and warranty apply to every variant under it.",
              content: (
                <form action={createModel} className="grid gap-2">
            <input name="brand" required placeholder="Brand" className={inputClass} />
            <input name="modelName" required placeholder="Model name" className={inputClass} />
            <div className="grid grid-cols-2 gap-2">
              <label className={labelClass}>
                Low stock threshold
                <input name="lowStockThreshold" type="number" min={0} defaultValue={3} className={inputClass} />
              </label>
              <label className={labelClass}>
                Warranty (months)
                <input name="warrantyMonths" type="number" min={0} defaultValue={0} className={inputClass} />
              </label>
            </div>
            <button className="btn btn-md btn-primary justify-self-start"><Plus className="size-4" />Create Model</button>
          </form>
              ),
            },
          ]}
        />
      </Card>

      <Card className="mb-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-1.5 text-lg font-semibold">
            Models &amp; variants
            <InfoHelp size="sm" title="Models & variants">
              <p>Every model with its color, storage and RAM options — switch between what&apos;s <b>in stock</b> now and <b>all</b> options. Each variant shows its live stock.</p>
              <p>Click a variant to see its units and edit its specs (or move it to another model). Edit/Delete on a card change or remove the whole model.</p>
            </InfoHelp>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <form method="get" className="relative">
              {Object.entries(searchParams).filter(([key, value]) => value && key !== "model").map(([key, value]) => <input key={key} type="hidden" name={key} value={String(value)} />)}
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
              <input name="model" defaultValue={modelQuery} placeholder="Filter models, colors…" className="w-48 rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-2 text-sm" />
            </form>
            <div className="flex overflow-hidden rounded-lg border border-slate-300 text-xs">
              <Link href={optionsHref("stock")} className={`px-2.5 py-1.5 ${optionsMode === "stock" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"}`}>In stock</Link>
              <Link href={optionsHref("all")} className={`px-2.5 py-1.5 ${optionsMode === "all" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"}`}>All options</Link>
            </div>
            <Link href="/items/phone-catalog" className="btn btn-xs btn-secondary">Catalog</Link>
            <Link href="/items/phones/price-history" className="btn btn-xs btn-secondary">Price history</Link>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {visibleModels.map((model) => (
            <ModelCardEditor key={model.id} model={model} inStock={inStockRecord} options={optionsFor(model)} optionsMode={optionsMode} updateAction={updateModel} deleteVariantAction={deleteVariant} deleteModelAction={deleteModel} />
          ))}
          {!visibleModels.length ? <p className="text-sm text-slate-600">{modelQuery ? "No models match that filter." : "No models yet — add one from Quick add above."}</p> : null}
        </div>
      </Card>

      <ListControls search={search} filter={status} view={view} placeholder="Search units by IMEI, model, variant or color" filterLabel="All statuses" filterOptions={["InStock", "Reserved", "Sold", "Returned", "Repair", "WrittenOff"].map((value) => ({ label: value, value }))} />

      <UnitEditProvider
        variants={pickerVariants}
        username={session?.user?.username}
        action={editUnit}
        checkImei={checkImei}
        lots={showCost ? (await prisma.lot.findMany({ where: { deletedAt: null }, orderBy: { purchaseDate: "desc" }, select: { id: true, lotNumber: true, status: true, supplier: { select: { name: true } } } })).map((item) => ({ id: item.id, label: `${item.lotNumber} — ${item.supplier.name}`, status: item.status })) : undefined}
        expenses={showCost ? { list: listUnitExpenses, add: addUnitExpense, categories: await expenseCategories() } : undefined}
        createVariant={{ action: createVariantFromPicker, models: models.map((model) => ({ id: model.id, label: `${model.brand} ${model.modelName}` })) }}
      >
      <Card className="mt-4">
        <h2 className="mb-3 flex items-center gap-1.5 text-lg font-semibold">
          Units
          <InfoHelp size="sm" title="Units">
            Individual phones by IMEI, newest first — search and filter with the bar above.{showCost ? " Click a unit for its cost and profit breakdown." : ""} Edit changes a unit&apos;s variant (or moves it to another model), IMEI, grade, notes and — for managers — prices. Archiving removes it from active stock (it stays in the Recycle Bin for 30 days).
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
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-900">{phone.phoneVariant.phoneModel.brand} {phone.phoneVariant.phoneModel.modelName}</span>
                      <span className="block truncate text-sm text-slate-600"><EntityLink kind="variant" id={phone.phoneVariant.id} className="truncate text-left text-slate-600 underline decoration-slate-300 decoration-dotted underline-offset-2 hover:decoration-slate-900">{phone.phoneVariant.variantName}</EntityLink></span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <StatusPill status={phone.status} />
                      {phone.status === "InStock" ? <PriceMissing retail={(phone as { retailPrice?: unknown }).retailPrice} wholesale={showCost ? (phone as { wholesalePrice?: unknown }).wholesalePrice : undefined} /> : null}
                    </span>
                  </div>
                  <SpecChips color={phone.phoneVariant.color} storage={phone.phoneVariant.storage} ram={phone.phoneVariant.ram} className="mt-1.5 flex" />
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
                    <div className="flex justify-between gap-2"><dt>IMEI</dt><dd className="text-right text-slate-800">{phone.imei}</dd></div>
                    <div className="flex justify-between gap-2"><dt>Lot</dt><dd className="text-right"><EntityLink kind="lot" id={phone.lot.id}>{phone.lot.lotNumber}</EntityLink></dd></div>
                    <div className="flex items-center justify-between gap-2"><dt>Grade</dt><dd><GradeBadge grade={phone.grade} /></dd></div>
                    {showCost ? <div className="flex justify-between gap-2"><dt>Purchase price</dt><dd className="text-right text-slate-800">{formatMoney(purchasePrice)}</dd></div> : null}
                  </dl>
                  {phone.notes ? <p className="mt-2 text-xs italic text-slate-500">{phone.notes}</p> : null}
                  <NoModalDiv className="mt-3 flex flex-wrap gap-2">
                    <UnitEditButton unit={editableUnit(phone)} />
                    <form action={archivePhone}>
                      <input type="hidden" name="id" value={phone.id} />
                      <button className="btn btn-xs btn-danger">Archive</button>
                    </form>
                  </NoModalDiv>
                </>
              );
              if (!showCost) {
                return (
                  <div key={phone.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    {cardBody}
                  </div>
                );
              }
              return (
                <CostCard
                  key={phone.id}
                  className="rounded-xl border border-slate-200 bg-white p-3 transition hover:border-slate-300 hover:shadow-sm"
                  data={{
                    name: `${formatPhoneName(phone.phoneVariant)} - IMEI ${phone.imei}`,
                    unitCost: purchasePrice,
                    totalCost,
                    wholesalePrice: Number(costFields.wholesalePrice ?? 0),
                    retailPrice: Number(costFields.retailPrice ?? 0),
                    costBreakdown: [
                      { label: "Tag cost", amount: Number(costFields.tagCost ?? 0) },
                      { label: "Battery cost", amount: Number(costFields.batteryCost ?? 0) },
                    ],
                    details: [
                      { label: "Model", value: `${phone.phoneVariant.phoneModel.brand} ${phone.phoneVariant.phoneModel.modelName}` },
                      { label: "Variant", value: phone.phoneVariant.variantName },
                      ...(formatVariantSpecs(phone.phoneVariant) ? [{ label: "Specs", value: formatVariantSpecs(phone.phoneVariant) }] : []),
                      { label: "IMEI", value: phone.imei },
                      { label: "Status", value: phone.status },
                      { label: "Grade", value: phone.grade || "Not Graded" },
                      { label: "Lot", value: phone.lot.lotNumber, href: `/lots/${phone.lot.id}` },
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
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
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
                    <td className="px-2 py-2.5">
                      <span className="font-mono text-xs text-slate-800">{phone.imei}</span>
                      {phone.notes ? <p className="mt-0.5 max-w-[16rem] truncate text-xs italic text-slate-500" title={phone.notes}>{phone.notes}</p> : null}
                    </td>
                    <td className="px-2 py-2.5 font-medium text-slate-900"><EntityLink kind="model" id={phone.phoneVariant.phoneModel.id}>{phone.phoneVariant.phoneModel.brand + " " + phone.phoneVariant.phoneModel.modelName}</EntityLink></td>
                    <td className="px-2 py-2.5">
                      <EntityLink kind="variant" id={phone.phoneVariant.id} className="text-left text-slate-700 underline decoration-slate-300 decoration-dotted underline-offset-2 hover:decoration-slate-900">{phone.phoneVariant.variantName}</EntityLink>
                      <SpecChips color={phone.phoneVariant.color} storage={phone.phoneVariant.storage} ram={phone.phoneVariant.ram} className="mt-1 flex" />
                    </td>
                    <td className="px-2 py-2.5"><EntityLink kind="lot" id={phone.lot.id}>{phone.lot.lotNumber}</EntityLink></td>
                    <td className="px-2 py-2.5"><GradeBadge grade={phone.grade} /></td>
                    <td className="px-2 py-2.5">
                      <StatusPill status={phone.status} />
                      {phone.status === "InStock" ? <PriceMissing retail={(phone as { retailPrice?: unknown }).retailPrice} wholesale={showCost ? (phone as { wholesalePrice?: unknown }).wholesalePrice : undefined} className="mt-1 flex" /> : null}
                    </td>
                    {showCost ? <td className="px-2 py-2">{formatMoney(purchasePrice)}</td> : null}
                    <NoModalCell className="px-2 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        <UnitEditButton unit={editableUnit(phone)} />
                        <form action={archivePhone}><input type="hidden" name="id" value={phone.id} /><button className="btn btn-xs btn-danger">Archive</button></form>
                      </div>
                    </NoModalCell>
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
                      name: `${formatPhoneName(phone.phoneVariant)} - IMEI ${phone.imei}`,
                      salesForPhoneId: phone.status === "Sold" || phone.status === "Returned" ? phone.id : undefined,
                      unitCost: purchasePrice,
                      totalCost,
                      wholesalePrice: Number(costFields.wholesalePrice ?? 0),
                      retailPrice: Number(costFields.retailPrice ?? 0),
                      costBreakdown: [
                        { label: "Tag cost", amount: Number(costFields.tagCost ?? 0) },
                        { label: "Battery cost", amount: Number(costFields.batteryCost ?? 0) },
                      ],
                      details: [
                        { label: "Model", value: `${phone.phoneVariant.phoneModel.brand} ${phone.phoneVariant.phoneModel.modelName}` },
                        { label: "Variant", value: phone.phoneVariant.variantName },
                      ...(formatVariantSpecs(phone.phoneVariant) ? [{ label: "Specs", value: formatVariantSpecs(phone.phoneVariant) }] : []),
                        { label: "IMEI", value: phone.imei },
                        { label: "Status", value: phone.status },
                        { label: "Grade", value: phone.grade || "Not Graded" },
                        { label: "Lot", value: phone.lot.lotNumber, href: `/lots/${phone.lot.id}` },
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
              {!phones.length ? (
                <tr>
                  <td className="px-2 py-6 text-center text-slate-500" colSpan={showCost ? 8 : 7}>
                    No units match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        )}
      </Card>
      </UnitEditProvider>
      <Pagination page={page} pageSize={pageSize} total={phoneTotal} query={{ ...(search ? { search } : {}), ...(status ? { filter: status } : {}), view }} />
    </div>
  );
}
