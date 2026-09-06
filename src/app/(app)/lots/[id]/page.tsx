import { revalidatePath } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { canViewCost } from "@/lib/rbac";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { LotRegisterForm, type BatchLine } from "@/components/items/lot-register-form";
import { SearchableSelect } from "@/components/ui/searchable-select";

export default async function LotDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) notFound();
  const showCost = canViewCost(session.user?.role as "admin" | "manager" | "staff" | undefined);

  const [lot, variants, models, allPhones, accessories] = await Promise.all([
    prisma.lot.findUnique({
      where: { id: params.id },
      include: {
        supplier: true,
        phones: { where: { deletedAt: null }, include: { phoneVariant: { include: { phoneModel: true } } }, orderBy: { createdAt: "desc" } },
        payments: { orderBy: { paidAt: "desc" } },
        accessoryItems: { include: { accessory: true }, orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.phoneVariant.findMany({ where: { deletedAt: null, phoneModel: { deletedAt: null } }, include: { phoneModel: true }, orderBy: { variantName: "asc" } }),
    prisma.phoneModel.findMany({ where: { deletedAt: null }, orderBy: [{ brand: "asc" }, { modelName: "asc" }] }),
    prisma.phone.findMany({ select: { imei: true } }),
    prisma.accessory.findMany({ where: { deletedAt: null }, orderBy: [{ category: "asc" }, { name: "asc" }] }),
  ]);
  if (!lot) notFound();

  const units = lot.phones.length;
  const landedTotal = Number(lot.shippingCost) + Number(lot.taxCost) + Number(lot.customsCost);
  const landedPerUnit = units > 0 ? landedTotal / units : 0;
  const unitsCost = lot.phones.reduce((sum, phone) => sum + Number(phone.purchasePrice), 0);
  const totalCost = landedTotal + unitsCost;
  const remaining = Math.max(0, totalCost - Number(lot.amountPaid));

  async function createModelForLot(formData: FormData) {
    "use server";

    const brand = String(formData.get("brand") || "").trim();
    const modelName = String(formData.get("modelName") || "").trim();
    if (!brand || !modelName) return;

    await prisma.phoneModel.create({ data: { brand, modelName } });
    revalidatePath(`/lots/${params.id}`);
  }

  async function createVariantForLot(formData: FormData) {
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
      data: { phoneModelId, variantName, color, storage, ram, screenSize, processor, camera, os, networkType, battery },
    });

    revalidatePath(`/lots/${params.id}`);
  }

  async function registerPhonesBatch(formData: FormData) {
    "use server";

    let batch: BatchLine[] = [];
    try {
      batch = JSON.parse(String(formData.get("batchItems") || "[]"));
    } catch {
      batch = [];
    }
    if (!batch.length) return;

    await prisma.$transaction(async (tx) => {
      // De-dupe within the submitted batch itself (keep first occurrence of each IMEI),
      // then drop anything that already exists in the database. Never trust the client's
      // "no duplicates" check alone — re-validate here so two IMEIs can never collide.
      const seen = new Set<string>();
      const deduped = batch.filter((line) => {
        const key = line.imei?.trim().toLowerCase();
        if (!line.variantId || !key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const existing = await tx.phone.findMany({
        where: { imei: { in: deduped.map((line) => line.imei.trim()) } },
        select: { imei: true },
      });
      const existingSet = new Set(existing.map((phone) => phone.imei.toLowerCase()));
      const toCreate = deduped.filter((line) => !existingSet.has(line.imei.trim().toLowerCase()));

      if (toCreate.length) {
        await tx.phone.createMany({
          data: toCreate.map((line) => ({
            phoneVariantId: line.variantId,
            lotId: params.id,
            imei: line.imei.trim(),
            purchasePrice: line.purchasePrice,
            wholesalePrice: line.wholesalePrice,
            retailPrice: line.retailPrice,
            grade: (["A", "B", "C"].includes(line.grade) ? line.grade : null) as "A" | "B" | "C" | null,
            batteryHealth: line.batteryHealth,
            notes: line.notes,
          })),
        });
      }
    });

    revalidatePath(`/lots/${params.id}`);
    revalidatePath("/lots");
    revalidatePath("/items/phones");
    revalidatePath("/dashboard");
  }

  async function recordLotPayment(formData: FormData) {
    "use server";

    const amount = Number(formData.get("amount") || 0);
    const methodInput = String(formData.get("method") || "");
    const method = (["Cash", "Card", "BankTransfer", "Cheque", "UPI", "Other"].includes(methodInput) ? methodInput : null) as "Cash" | "Card" | "BankTransfer" | "Cheque" | "UPI" | "Other" | null;
    const reference = String(formData.get("reference") || "").trim() || null;
    const paidAtInput = String(formData.get("paidAt") || "").trim();
    const paidAt = paidAtInput ? new Date(paidAtInput) : new Date();

    if (!amount || amount <= 0) return;

    await prisma.$transaction(async (tx) => {
      await tx.lotPayment.create({ data: { lotId: params.id, amount, method, reference, paidAt } });

      const currentLot = await tx.lot.findUnique({
        where: { id: params.id },
        include: { phones: { where: { deletedAt: null }, select: { purchasePrice: true } } },
      });
      if (!currentLot) return;

      const newAmountPaid = Number(currentLot.amountPaid) + amount;
      const currentTotalCost =
        Number(currentLot.shippingCost) + Number(currentLot.taxCost) + Number(currentLot.customsCost) + currentLot.phones.reduce((sum, phone) => sum + Number(phone.purchasePrice), 0);
      const newStatus = newAmountPaid <= 0 ? "Unpaid" : newAmountPaid >= currentTotalCost && currentTotalCost > 0 ? "Paid" : "Partial";

      await tx.lot.update({ where: { id: params.id }, data: { amountPaid: newAmountPaid, paymentStatus: newStatus } });
    });

    revalidatePath(`/lots/${params.id}`);
    revalidatePath("/lots");
  }

  async function archivePhone(formData: FormData) {
    "use server";
    const id = String(formData.get("id") || "");
    if (!id) return;
    await prisma.phone.update({ where: { id }, data: { deletedAt: new Date() } });
    revalidatePath(`/lots/${params.id}`);
    revalidatePath("/items/phones");
  }

  async function createAccessoryForLot(formData: FormData) {
    "use server";

    const name = String(formData.get("name") || "").trim();
    const categoryInput = String(formData.get("category") || "");
    const category = ["Charger", "Cable", "Handsfree", "Other"].includes(categoryInput) ? categoryInput : "Other";
    const sku = String(formData.get("sku") || "").trim();
    const purchasePrice = Number(formData.get("purchasePrice") || 0);
    const retailPrice = Number(formData.get("retailPrice") || 0);
    if (!name || !sku) return;

    await prisma.accessory.create({ data: { name, category, sku, purchasePrice, retailPrice, quantity: 0 } });

    revalidatePath(`/lots/${params.id}`);
    revalidatePath("/items/chargers");
    revalidatePath("/items/cables");
    revalidatePath("/items/handsfree");
    revalidatePath("/items/other");
  }

  async function addAccessoryToLot(formData: FormData) {
    "use server";

    const accessoryId = String(formData.get("accessoryId") || "");
    const quantity = Math.max(0, Math.round(Number(formData.get("quantity") || 0)));
    const unitCost = Math.max(0, Number(formData.get("unitCost") || 0));
    if (!accessoryId || quantity <= 0) return;

    await prisma.$transaction(async (tx) => {
      // Same accessory at the same unit cost is the same batch — merge into it rather
      // than listing it twice. A different cost is a genuinely different purchase batch
      // (prices change over time), so that gets its own line.
      const existing = await tx.lotAccessoryItem.findFirst({ where: { lotId: params.id, accessoryId, unitCost } });
      if (existing) {
        await tx.lotAccessoryItem.update({ where: { id: existing.id }, data: { quantity: { increment: quantity } } });
      } else {
        await tx.lotAccessoryItem.create({ data: { lotId: params.id, accessoryId, quantity, unitCost } });
      }

      // The batches above already keep each distinct cost as its own line — that's the
      // real cost record. The accessory's own purchasePrice is a separate, manually-set
      // reference value and stays untouched here; it's never auto-computed from batches.
      await tx.accessory.update({ where: { id: accessoryId }, data: { quantity: { increment: quantity } } });
    });

    revalidatePath(`/lots/${params.id}`);
    revalidatePath("/items/chargers");
    revalidatePath("/items/cables");
    revalidatePath("/items/handsfree");
    revalidatePath("/items/other");
    revalidatePath("/dashboard");
  }

  async function removeAccessoryFromLot(formData: FormData) {
    "use server";

    const id = String(formData.get("id") || "");
    if (!id) return;

    const item = await prisma.lotAccessoryItem.findUnique({ where: { id } });
    if (!item) return;

    await prisma.$transaction(async (tx) => {
      const accessory = await tx.accessory.findUnique({ where: { id: item.accessoryId } });
      if (accessory) {
        // Never go negative — some of this stock may have already sold since it was added.
        const nextQuantity = Math.max(0, accessory.quantity - item.quantity);
        await tx.accessory.update({ where: { id: item.accessoryId }, data: { quantity: nextQuantity } });
      }
      await tx.lotAccessoryItem.delete({ where: { id } });
    });

    revalidatePath(`/lots/${params.id}`);
    revalidatePath("/items/chargers");
    revalidatePath("/items/cables");
    revalidatePath("/items/handsfree");
    revalidatePath("/items/other");
    revalidatePath("/dashboard");
  }

  return (
    <div>
      <PageHeader title={`Lot ${lot.lotNumber}`} subtitle={`Supplied by ${lot.supplier.name}`} />
      <div className="mb-4">
        <Link href="/lots" className="text-sm text-slate-700 underline">Back to Lots</Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-xs font-semibold uppercase text-slate-500">Supplier</p>
          <p className="mt-2 font-semibold text-slate-900">{lot.supplier.name}</p>
          <p className="mt-1 text-sm text-slate-700">{lot.supplier.phone || lot.supplier.email || "No contact details"}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase text-slate-500">Purchase</p>
          <p className="mt-2 text-sm text-slate-700">Date: {lot.purchaseDate.toISOString().slice(0, 10)}</p>
          <p className="text-sm text-slate-700">Units: {units}</p>
        </Card>
        {showCost ? (
          <Card>
            <p className="text-xs font-semibold uppercase text-slate-500">Landed Cost</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">${landedPerUnit.toFixed(2)}/unit</p>
            <p className="text-sm text-slate-700">Shipping ${Number(lot.shippingCost).toFixed(2)} · Tax ${Number(lot.taxCost).toFixed(2)} · Customs ${Number(lot.customsCost).toFixed(2)}</p>
          </Card>
        ) : null}
        <Card>
          <p className="text-xs font-semibold uppercase text-slate-500">Payment</p>
          <p className="mt-2">
            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${lot.paymentStatus === "Paid" ? "bg-green-100 text-green-800" : lot.paymentStatus === "Partial" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>{lot.paymentStatus}</span>
          </p>
          {showCost ? (
            <>
              <p className="mt-2 text-sm text-slate-700">Total cost: ${totalCost.toFixed(2)}</p>
              <p className="text-sm text-slate-700">Paid: ${Number(lot.amountPaid).toFixed(2)}</p>
              <p className="text-sm font-medium text-slate-900">Remaining: ${remaining.toFixed(2)}</p>
            </>
          ) : null}
        </Card>
      </div>

      {showCost ? (
        <Card className="mt-4">
          <h2 className="mb-3 text-lg font-semibold">Record a Payment</h2>
          <form action={recordLotPayment} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid min-w-0 gap-1 text-sm text-slate-700">
              Amount
              <input name="amount" type="number" step="0.01" min={0.01} required placeholder={`Remaining: $${remaining.toFixed(2)}`} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
            </label>
            <label className="grid min-w-0 gap-1 text-sm text-slate-700">
              Method
              <select name="method" defaultValue="" className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2">
                <option value="">Select method</option>
                <option value="Cash">Cash</option>
                <option value="Card">Card</option>
                <option value="BankTransfer">Bank Transfer</option>
                <option value="Cheque">Cheque</option>
                <option value="UPI">UPI</option>
                <option value="Other">Other</option>
              </select>
            </label>
            <label className="grid min-w-0 gap-1 text-sm text-slate-700">
              Reference
              <input name="reference" placeholder="Receipt / transaction #" className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
            </label>
            <label className="grid min-w-0 gap-1 text-sm text-slate-700">
              Date
              <input name="paidAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
            </label>
            <button className="rounded-lg bg-slate-900 px-3 py-2 text-white md:col-span-2 xl:col-span-4">Record Payment</button>
          </form>

          {lot.payments.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-300 text-left text-slate-700">
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2">Amount</th>
                    <th className="px-2 py-2">Method</th>
                    <th className="px-2 py-2">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {lot.payments.map((payment) => (
                    <tr key={payment.id} className="border-b border-slate-200">
                      <td className="px-2 py-2">{payment.paidAt.toISOString().slice(0, 10)}</td>
                      <td className="px-2 py-2">${Number(payment.amount).toFixed(2)}</td>
                      <td className="px-2 py-2">{payment.method || "-"}</td>
                      <td className="px-2 py-2">{payment.reference || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-600">No payments recorded yet.</p>
          )}
        </Card>
      ) : null}

      <Card className="mt-4">
        <h2 className="mb-3 text-lg font-semibold">Register Phones in This Lot</h2>
        <p className="mb-3 text-sm text-slate-600">Pick a product, scan or type each IMEI, and click Add to Batch — the product stays selected so you can keep adding more units of it. Create a brand-new variant on the fly with the + option in the picker.</p>
        <LotRegisterForm
          variants={variants.map((variant) => ({ value: variant.id, label: `${variant.phoneModel.brand} ${variant.phoneModel.modelName} - ${variant.variantName}` }))}
          existingImeis={allPhones.map((phone) => phone.imei)}
          showCost={showCost}
          action={registerPhonesBatch}
          variantQuickAdd={{
            label: "Variant",
            action: createVariantForLot,
            fields: [
              {
                name: "phoneModelId",
                label: "Model",
                type: "select",
                required: true,
                options: models.map((model) => ({ value: model.id, label: `${model.brand} ${model.modelName}` })),
                quickAdd: { label: "Model", action: createModelForLot, fields: [{ name: "brand", label: "Brand", required: true }, { name: "modelName", label: "Model name", required: true }] },
              },
              { name: "variantName", label: "Variant name", required: true },
              { name: "color", label: "Color" },
              { name: "storage", label: "Storage (ROM)" },
              { name: "ram", label: "RAM" },
              { name: "screenSize", label: "Screen size" },
              { name: "processor", label: "Processor" },
              { name: "camera", label: "Camera" },
              { name: "os", label: "OS" },
              { name: "networkType", label: "Network (4G/5G)" },
              { name: "battery", label: "Battery capacity" },
            ],
          }}
        />
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 text-lg font-semibold">Units in This Lot</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-slate-700">
                <th className="px-2 py-2">IMEI</th>
                <th className="px-2 py-2">Model</th>
                <th className="px-2 py-2">Variant</th>
                <th className="px-2 py-2">Grade</th>
                <th className="px-2 py-2">Battery</th>
                <th className="px-2 py-2">Status</th>
                {showCost ? <th className="px-2 py-2">Purchase Price</th> : null}
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {lot.phones.map((phone) => (
                <tr key={phone.id} className="border-b border-slate-200">
                  <td className="px-2 py-2">
                    {phone.imei}
                    {phone.notes ? <p className="mt-0.5 text-xs italic text-slate-500">{phone.notes}</p> : null}
                  </td>
                  <td className="px-2 py-2">{phone.phoneVariant.phoneModel.brand} {phone.phoneVariant.phoneModel.modelName}</td>
                  <td className="px-2 py-2">{phone.phoneVariant.variantName}</td>
                  <td className="px-2 py-2">{phone.grade || "-"}</td>
                  <td className="px-2 py-2">{phone.batteryHealth !== null ? `${phone.batteryHealth}%` : "-"}</td>
                  <td className="px-2 py-2">{phone.status}</td>
                  {showCost ? <td className="px-2 py-2">${Number(phone.purchasePrice).toFixed(2)}</td> : null}
                  <td className="px-2 py-2">
                    <form action={archivePhone}>
                      <input type="hidden" name="id" value={phone.id} />
                      <button className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700">Archive</button>
                    </form>
                  </td>
                </tr>
              ))}
              {!lot.phones.length ? (
                <tr>
                  <td className="px-2 py-4 text-slate-600" colSpan={showCost ? 8 : 7}>
                    No units registered in this lot yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 text-lg font-semibold">Add Accessories to This Lot</h2>
        <p className="mb-3 text-sm text-slate-600">
          Accessories aren&apos;t serialized like phones, so add them by quantity — each add here increases that item&apos;s stock count immediately. Don&apos;t see the item? Create it on the fly with the + option in the picker.
        </p>
        <form action={addAccessoryToLot} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="grid min-w-0 gap-1 text-sm text-slate-700 xl:col-span-2">
            Accessory
            <SearchableSelect
              name="accessoryId"
              required
              placeholder="Select accessory"
              options={accessories.map((item) => ({ value: item.id, label: `${item.name} (${item.sku}) — ${item.category}` }))}
              quickAdd={{
                label: "Accessory",
                action: createAccessoryForLot,
                fields: [
                  { name: "name", label: "Name", required: true },
                  { name: "category", label: "Category", type: "select", required: true, options: [{ value: "Charger", label: "Charger" }, { value: "Cable", label: "Cable" }, { value: "Handsfree", label: "Handsfree" }, { value: "Other", label: "Other" }] },
                  { name: "sku", label: "SKU", required: true },
                  { name: "purchasePrice", label: "Purchase price", type: "number", required: true },
                  { name: "retailPrice", label: "Retail price", type: "number", required: true },
                ],
              }}
            />
          </label>
          <label className="grid min-w-0 gap-1 text-sm text-slate-700">
            Quantity
            <input name="quantity" type="number" min={1} step="1" required defaultValue={1} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
          </label>
          {showCost ? (
            <label className="grid min-w-0 gap-1 text-sm text-slate-700">
              Unit cost
              <input name="unitCost" type="number" min={0} step="0.01" defaultValue={0} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
            </label>
          ) : null}
          <button className="rounded-lg bg-slate-900 px-3 py-2 text-white md:col-span-2 xl:col-span-4">Add to Lot</button>
        </form>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-slate-700">
                <th className="px-2 py-2">Item</th>
                <th className="px-2 py-2">SKU</th>
                <th className="px-2 py-2">Quantity</th>
                {showCost ? <th className="px-2 py-2">Unit Cost</th> : null}
                {showCost ? <th className="px-2 py-2">Subtotal</th> : null}
                <th className="px-2 py-2">Added</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {lot.accessoryItems.map((item) => (
                <tr key={item.id} className="border-b border-slate-200">
                  <td className="px-2 py-2">{item.accessory.name}</td>
                  <td className="px-2 py-2">{item.accessory.sku}</td>
                  <td className="px-2 py-2">{item.quantity}</td>
                  {showCost ? <td className="px-2 py-2">${Number(item.unitCost).toFixed(2)}</td> : null}
                  {showCost ? <td className="px-2 py-2">${(Number(item.unitCost) * item.quantity).toFixed(2)}</td> : null}
                  <td className="px-2 py-2">{item.createdAt.toISOString().slice(0, 10)}</td>
                  <td className="px-2 py-2">
                    <form action={removeAccessoryFromLot}>
                      <input type="hidden" name="id" value={item.id} />
                      <button className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700">Remove</button>
                    </form>
                  </td>
                </tr>
              ))}
              {!lot.accessoryItems.length ? (
                <tr>
                  <td className="px-2 py-4 text-slate-600" colSpan={showCost ? 7 : 5}>
                    No accessories added to this lot yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
