import { revalidatePath } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { createOrRestorePhoneVariant } from "@/lib/phone-variants";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { canViewCost } from "@/lib/rbac";
import { checkReauth } from "@/lib/reauth";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { InfoHelp } from "@/components/ui/info-help";
import { LotRegisterForm, type BatchLine } from "@/components/items/lot-register-form";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { FxAmountInput } from "@/components/ui/fx-amount-input";
import { formatMoney } from "@/lib/currency";
import { uploadFile, getSignedDownloadUrl, isStorageKey, buildKey } from "@/lib/storage";
import { PhoneCostEditor } from "@/components/items/phone-cost-editor";
import { CostRow } from "@/components/ui/cost-breakdown-modal";
import { NoModalCell } from "@/components/ui/no-modal-cell";
import { LotChargeEditor } from "@/components/items/lot-charge-editor";
import type { ActionResult } from "@/components/ui/editable-row";
import type { CreateVariantResult } from "@/components/items/variant-picker";
import { EntityDeleteButton, EntityEditButton } from "@/components/ui/entity-editor";
import { auditChange, diffFields, requireReauthWhen } from "@/lib/entity-guard";
import { formatVariantSpecs } from "@/lib/format-item-name";
import { lotDeleteImpact, recomputeLotPayments, softDeleteLot, toggleLotBookmark } from "@/lib/lots";
import { softDeleteLotPayment } from "@/lib/payments";
import { BookmarkButton } from "@/components/items/bookmark-button";
import { priceChangeLogs } from "@/lib/price-history";
import { findImeiOwner, liveImeiOwners } from "@/lib/imei";
import { editPhoneUnit } from "@/lib/phone-units";
import { createPhoneExpense, expenseCategories, listPhoneExpenses } from "@/lib/unit-expenses";
import { UnitEditProvider } from "@/components/items/unit-edit";
import { EntityLink } from "@/components/ui/entity-link";
import { withErrorLog } from "@/lib/error-log";

function computeGoodsCost(phones: { purchasePrice: unknown }[], accessoryItems: { unitCost: unknown; quantity: number }[]) {
  return phones.reduce((sum, phone) => sum + Number(phone.purchasePrice), 0) + accessoryItems.reduce((sum, item) => sum + Number(item.unitCost) * item.quantity, 0);
}

export default async function LotDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) notFound();
  const showCost = canViewCost(session.user?.role as "admin" | "manager" | "staff" | undefined);
  const username = session.user?.username;

  const [lot, variants, models, allPhones, accessories] = await Promise.all([
    prisma.lot.findUnique({
      where: { id: params.id },
      include: {
        supplier: true,
        phones: { where: { deletedAt: null }, include: { phoneVariant: { include: { phoneModel: true } } }, orderBy: { createdAt: "desc" } },
        payments: { where: { deletedAt: null }, orderBy: { paidAt: "desc" } },
        accessoryItems: { include: { accessory: true }, orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.phoneVariant.findMany({ where: { deletedAt: null, phoneModel: { deletedAt: null } }, include: { phoneModel: true }, orderBy: { variantName: "asc" } }),
    prisma.phoneModel.findMany({ where: { deletedAt: null }, orderBy: [{ brand: "asc" }, { modelName: "asc" }] }),
    liveImeiOwners(),
    prisma.accessory.findMany({ where: { deletedAt: null }, orderBy: [{ category: "asc" }, { name: "asc" }] }),
  ]);
  if (!lot || lot.deletedAt) notFound();
  const supplierOptions = await prisma.supplier.findMany({ where: { OR: [{ deletedAt: null }, { id: lot.supplierId }] }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const deleteImpact = await lotDeleteImpact(lot.id);
  const bookmarked = Boolean(await prisma.lotBookmark.findUnique({ where: { userId_lotId: { userId: session.user.id, lotId: lot.id } } }));

  const [lotSaleItems, lotReturnItems, phoneExpenseRows, accessoryExpenseRows] = await Promise.all([
    prisma.saleItem.findMany({
      where: { phone: { lotId: lot.id } },
      select: {
        id: true,
        quantity: true,
        unitPrice: true,
        phoneId: true,
        sale: { select: { id: true, saleNumber: true, saleDate: true, status: true, saleType: true, customerId: true, customer: { select: { name: true } } } },
        phone: { select: { imei: true, purchasePrice: true, tagCost: true, batteryCost: true, repairCost: true, phoneVariant: { select: { variantName: true, color: true, storage: true, ram: true, phoneModel: { select: { brand: true, modelName: true } } } } } },
      },
      orderBy: { sale: { saleDate: "desc" } },
    }),
    prisma.returnItem.findMany({ where: { phone: { lotId: lot.id } }, select: { phoneId: true, condition: true } }),
    // Expenses (and the popup they feed) are cost-sensitive — only fetch for roles that
    // can already view cost, matching this page's Purchase/Tag/Battery Cost columns.
    showCost ? prisma.expense.findMany({ where: { phoneId: { in: lot.phones.map((phone) => phone.id) } }, orderBy: { expenseDate: "desc" } }) : Promise.resolve([]),
    showCost ? prisma.expense.findMany({ where: { accessoryId: { in: lot.accessoryItems.map((item) => item.accessoryId) } }, orderBy: { expenseDate: "desc" } }) : Promise.resolve([]),
  ]);
  const expensesByPhone = new Map<string, typeof phoneExpenseRows>();
  for (const expense of phoneExpenseRows) {
    if (!expense.phoneId) continue;
    const list = expensesByPhone.get(expense.phoneId) ?? [];
    list.push(expense);
    expensesByPhone.set(expense.phoneId, list);
  }
  const expensesByAccessory = new Map<string, typeof accessoryExpenseRows>();
  for (const expense of accessoryExpenseRows) {
    if (!expense.accessoryId) continue;
    const list = expensesByAccessory.get(expense.accessoryId) ?? [];
    list.push(expense);
    expensesByAccessory.set(expense.accessoryId, list);
  }

  const canGrade = lot.status === "Cleared";
  const requirePhoneCostReauth = lot.status !== "Collection";
  const requireShippingReauth = lot.status === "Cleared";

  const units = lot.phones.length;
  const landedTotal = Number(lot.shippingCost) + Number(lot.taxCost) + Number(lot.customsCost) + Number(lot.otherCost);
  const landedPerUnit = units > 0 ? landedTotal / units : 0;
  // Unit cost basis (for profit/COGS) is independent of the goods-cost-owed total below —
  // it's always the sum of each unit's own recorded costs.
  const unitsCost = lot.phones.reduce((sum, phone) => sum + Number(phone.purchasePrice) + Number(phone.tagCost) + Number(phone.batteryCost) + Number(phone.repairCost), 0);
  // Goods cost is never manually entered — it's always the running sum of what's been
  // added to the lot so far (phones' purchase price + accessory batch costs), which is
  // exactly what "the goods cost builds up as you add items" means during Collection.
  const goodsCost = computeGoodsCost(lot.phones, lot.accessoryItems);
  const totalCost = landedTotal + goodsCost;
  const remaining = Math.max(0, totalCost - Number(lot.amountPaid));

  // Per-lot performance stats.
  const soldPhones = lot.phones.filter((phone) => phone.status === "Sold");
  const inStockCount = lot.phones.filter((phone) => phone.status === "InStock").length;
  const writtenOffCount = lot.phones.filter((phone) => phone.status === "WrittenOff").length;
  const damagedPhoneIds = new Set(lotReturnItems.filter((item) => item.condition === "Damaged" && item.phoneId).map((item) => item.phoneId as string));
  const writtenOffPhoneIds = new Set(lot.phones.filter((phone) => phone.status === "WrittenOff").map((phone) => phone.id));
  const damagedCount = writtenOffCount + Array.from(damagedPhoneIds).filter((id) => !writtenOffPhoneIds.has(id)).length;
  const returnedPhoneIds = new Set(lotReturnItems.map((item) => item.phoneId).filter(Boolean));
  const returnRate = soldPhones.length + returnedPhoneIds.size > 0 ? (returnedPhoneIds.size / (soldPhones.length + returnedPhoneIds.size)) * 100 : 0;
  const depletionRate = units > 0 ? (soldPhones.length / units) * 100 : 0;
  const daysSincePurchase = Math.max(1, Math.round((Date.now() - lot.purchaseDate.getTime()) / (1000 * 60 * 60 * 24)));
  const velocityPerDay = soldPhones.length / daysSincePurchase;
  const soldPhoneIds = new Set(soldPhones.map((phone) => phone.id));
  const revenueFromLot = lotSaleItems.filter((item) => item.phoneId && soldPhoneIds.has(item.phoneId)).reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);
  const costOfSoldUnits = soldPhones.reduce((sum, phone) => sum + Number(phone.purchasePrice) + Number(phone.tagCost) + Number(phone.batteryCost) + Number(phone.repairCost), 0);
  const allocatedLandedCost = units > 0 ? landedTotal * (soldPhones.length / units) : 0;
  const lotProfit = revenueFromLot - costOfSoldUnits - allocatedLandedCost;

  const paymentProofLinks = await Promise.all(
    lot.payments.map((payment) => (payment.proofImageUrl ? (isStorageKey(payment.proofImageUrl) ? getSignedDownloadUrl(payment.proofImageUrl) : payment.proofImageUrl) : null))
  );

  async function createModelForLot(formData: FormData) {
    "use server";

    const brand = String(formData.get("brand") || "").trim();
    const modelName = String(formData.get("modelName") || "").trim();
    if (!brand || !modelName) return;

    await prisma.phoneModel.create({ data: { brand, modelName } });
    revalidatePath(`/lots/${params.id}`);
  }

  async function createVariantForLot(formData: FormData): Promise<CreateVariantResult> {
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

    if (!phoneModelId) return { ok: false, error: "Select a model." };

    const variant = await createOrRestorePhoneVariant({ phoneModelId, variantName, color, storage, ram, screenSize, processor, camera, os, networkType, battery });

    revalidatePath(`/lots/${params.id}`);
    revalidatePath("/items/phones");
    return { ok: true, id: variant.id };
  }

  async function registerPhonesBatch(formData: FormData) {
    "use server";
    return withErrorLog("lots/detail: registerPhonesBatch", formData, async () => {
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
          where: { imei: { in: deduped.map((line) => line.imei.trim()) }, deletedAt: null },
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
              tagCost: line.tagCost || 0,
              batteryCost: line.batteryCost || 0,
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
    });
  }

  async function recordLotPayment(formData: FormData) {
    "use server";
    return withErrorLog("lots/detail: recordLotPayment", formData, async () => {
      const amount = Number(formData.get("amount") || 0);
      const methodInput = String(formData.get("method") || "");
      const method = (["Cash", "Card", "BankTransfer", "Cheque", "UPI", "Other"].includes(methodInput) ? methodInput : null) as "Cash" | "Card" | "BankTransfer" | "Cheque" | "UPI" | "Other" | null;
      const reference = String(formData.get("reference") || "").trim() || null;
      const paidAtInput = String(formData.get("paidAt") || "").trim();
      const paidAt = paidAtInput ? new Date(paidAtInput) : new Date();

      if (!amount || amount <= 0) return;

      let proofImageUrl: string | null = null;
      const proofFile = formData.get("proofFile");
      if (proofFile instanceof File && proofFile.size > 0) {
        const key = buildKey(`lot-payments/${params.id}`, proofFile.name);
        await uploadFile(Buffer.from(await proofFile.arrayBuffer()), key, proofFile.type || "application/octet-stream");
        proofImageUrl = key;
      }

      await prisma.$transaction(async (tx) => {
        await tx.lotPayment.create({ data: { lotId: params.id, amount, method, reference, paidAt, proofImageUrl } });

        const currentLot = await tx.lot.findUnique({
          where: { id: params.id },
          include: {
            phones: { where: { deletedAt: null }, select: { purchasePrice: true } },
            accessoryItems: { select: { unitCost: true, quantity: true } },
          },
        });
        if (!currentLot) return;

        const newAmountPaid = Number(currentLot.amountPaid) + amount;
        const currentGoodsCost = computeGoodsCost(currentLot.phones, currentLot.accessoryItems);
        const currentTotalCost =
          Number(currentLot.shippingCost) + Number(currentLot.taxCost) + Number(currentLot.customsCost) + Number(currentLot.otherCost) + currentGoodsCost;
        const newStatus = newAmountPaid <= 0 ? "Unpaid" : newAmountPaid >= currentTotalCost && currentTotalCost > 0 ? "Paid" : "Partial";

        await tx.lot.update({ where: { id: params.id }, data: { amountPaid: newAmountPaid, paymentStatus: newStatus } });
      });

      revalidatePath(`/lots/${params.id}`);
      revalidatePath("/lots");
    });
  }

  async function moveToShipped(formData: FormData) {
    "use server";
    return withErrorLog("lots/detail: moveToShipped", formData, async () => {
      if (lot!.status !== "Collection") return;
      const shippingCost = Number(formData.get("shippingCost") || 0);

      const fxDetails: Record<string, { foreignAmount: number; rate: number }> = {};
      const raw = String(formData.get("__fx_shippingCost") || "");
      if (raw) {
        try {
          fxDetails.shippingCost = JSON.parse(raw);
        } catch {
          // ignore malformed payload
        }
      }

      await prisma.lot.update({
        where: { id: params.id },
        data: { shippingCost, status: "Shipped", fxDetails: Object.keys(fxDetails).length ? (fxDetails as Prisma.InputJsonValue) : undefined },
      });

      revalidatePath(`/lots/${params.id}`);
      revalidatePath("/lots");
    });
  }

  async function markLotCleared(formData: FormData) {
    "use server";
    return withErrorLog("lots/detail: markLotCleared", formData, async () => {
      const taxCost = Number(formData.get("taxCost") || 0);
      const customsCost = Number(formData.get("customsCost") || 0);
      const otherCost = Number(formData.get("otherCost") || 0);

      const fxUpdates: Record<string, { foreignAmount: number; rate: number }> = {};
      for (const field of ["taxCost", "customsCost", "otherCost"]) {
        const raw = String(formData.get(`__fx_${field}`) || "");
        if (raw) {
          try {
            fxUpdates[field] = JSON.parse(raw);
          } catch {
            // ignore malformed payload
          }
        }
      }

      const currentLot = await prisma.lot.findUnique({ where: { id: params.id }, select: { fxDetails: true } });
      const mergedFx = { ...(currentLot?.fxDetails as Record<string, unknown> | null), ...fxUpdates };

      await prisma.lot.update({
        where: { id: params.id },
        data: { taxCost, customsCost, otherCost, status: "Cleared", fxDetails: Object.keys(mergedFx).length ? (mergedFx as Prisma.InputJsonValue) : undefined },
      });

      revalidatePath(`/lots/${params.id}`);
      revalidatePath("/lots");
    });
  }

  async function editShippingCost(formData: FormData): Promise<ActionResult> {
    "use server";

    const currentLot = await prisma.lot.findUnique({ where: { id: params.id }, select: { status: true, fxDetails: true } });
    if (!currentLot) return { ok: false, error: "Lot not found." };

    if (currentLot.status === "Cleared") {
      const check = await checkReauth(formData);
      if (!check.ok) return check;
    }

    const shippingCost = Number(formData.get("shippingCost") || 0);
    const raw = String(formData.get("__fx_shippingCost") || "");
    let fxUpdate: { foreignAmount: number; rate: number } | null = null;
    if (raw) {
      try {
        fxUpdate = JSON.parse(raw);
      } catch {
        // ignore malformed payload
      }
    }
    const mergedFx = { ...(currentLot.fxDetails as Record<string, unknown> | null), ...(fxUpdate ? { shippingCost: fxUpdate } : {}) };

    await prisma.lot.update({
      where: { id: params.id },
      data: { shippingCost, fxDetails: Object.keys(mergedFx).length ? (mergedFx as Prisma.InputJsonValue) : undefined },
    });

    revalidatePath(`/lots/${params.id}`);
    revalidatePath("/lots");
    return { ok: true };
  }

  async function editClearanceCharges(formData: FormData): Promise<ActionResult> {
    "use server";
    // Cleared is terminal — there's no later stage these could belong to, so this is
    // always a same-stage correction and never re-auth gated.

    const taxCost = Number(formData.get("taxCost") || 0);
    const customsCost = Number(formData.get("customsCost") || 0);
    const otherCost = Number(formData.get("otherCost") || 0);

    const fxUpdates: Record<string, { foreignAmount: number; rate: number }> = {};
    for (const field of ["taxCost", "customsCost", "otherCost"]) {
      const raw = String(formData.get(`__fx_${field}`) || "");
      if (raw) {
        try {
          fxUpdates[field] = JSON.parse(raw);
        } catch {
          // ignore malformed payload
        }
      }
    }

    const currentLot = await prisma.lot.findUnique({ where: { id: params.id }, select: { fxDetails: true } });
    const mergedFx = { ...(currentLot?.fxDetails as Record<string, unknown> | null), ...fxUpdates };

    await prisma.lot.update({
      where: { id: params.id },
      data: { taxCost, customsCost, otherCost, fxDetails: Object.keys(mergedFx).length ? (mergedFx as Prisma.InputJsonValue) : undefined },
    });

    revalidatePath(`/lots/${params.id}`);
    revalidatePath("/lots");
    return { ok: true };
  }

  async function updatePhoneCosts(formData: FormData): Promise<ActionResult> {
    "use server";

    const id = String(formData.get("id") || "");
    if (!id) return { ok: false, error: "Missing phone id." };

    const currentLot = await prisma.lot.findUnique({ where: { id: params.id }, select: { status: true } });
    if (currentLot && currentLot.status !== "Collection") {
      const check = await checkReauth(formData);
      if (!check.ok) return check;
    }

    const existingPhone = await prisma.phone.findUnique({ where: { id }, select: { imei: true, lotId: true, retailPrice: true, wholesalePrice: true } });
    if (!existingPhone || existingPhone.lotId !== params.id) return { ok: false, error: "Unit not found in this lot." };
    const imei = String(formData.get("imei") ?? existingPhone.imei).trim();
    if (!imei) return { ok: false, error: "IMEI can't be empty." };
    if (imei !== existingPhone.imei) {
      const owner = await findImeiOwner(imei, id);
      if (owner) return { ok: false, error: `IMEI ${imei} is already registered to ${owner.phone} in lot ${owner.lotNumber} (${owner.status}). An IMEI can only belong to one active phone — archive or correct that unit first.` };
    }

    const purchasePrice = Number(formData.get("purchasePrice") || 0);
    const wholesalePrice = Number(formData.get("wholesalePrice") || 0);
    const retailPrice = Number(formData.get("retailPrice") || 0);
    const tagCost = Number(formData.get("tagCost") || 0);
    const batteryCost = Number(formData.get("batteryCost") || 0);
    const gradeInput = String(formData.get("grade") || "");
    const grade = (["A", "B", "C"].includes(gradeInput) ? gradeInput : null) as "A" | "B" | "C" | null;
    const batteryHealthInput = String(formData.get("batteryHealth") || "");
    const batteryHealth = batteryHealthInput.trim() ? Math.max(0, Math.min(100, Number(batteryHealthInput))) : null;

    const data: Prisma.PhoneUpdateInput = { imei, purchasePrice, wholesalePrice, retailPrice, tagCost, batteryCost };
    if (currentLot?.status === "Cleared") {
      data.grade = grade;
      data.batteryHealth = batteryHealth;
    }

    const actingUser = await getServerSession(authOptions);
    const priceLogs = priceChangeLogs(id, actingUser?.user?.id, existingPhone, { retailPrice, wholesalePrice });
    await prisma.$transaction([prisma.phone.update({ where: { id }, data }), ...(priceLogs.length ? [prisma.auditLog.createMany({ data: priceLogs })] : [])]);

    revalidatePath(`/lots/${params.id}`);
    revalidatePath("/items/phones");
    revalidatePath("/items/phones/price-history");
    return { ok: true };
  }

  async function toggleBookmark(formData: FormData) {
    "use server";
    const actor = await getServerSession(authOptions);
    const lotId = String(formData.get("lotId") || "");
    if (!actor?.user?.id || !lotId) return;
    await toggleLotBookmark(actor.user.id, lotId);
    revalidatePath(`/lots/${lotId}`);
    revalidatePath("/lots");
    revalidatePath("/dashboard");
  }

  // Lot details: note is non-sensitive; lot number, supplier and start date identify the purchase
  // record, so changing them needs a review + password and is audit-logged.
  async function updateLotDetails(formData: FormData): Promise<ActionResult> {
    "use server";
    const current = await prisma.lot.findUnique({ where: { id: params.id } });
    if (!current || current.deletedAt) return { ok: false, error: "Lot not found." };
    const next = {
      lotNumber: String(formData.get("lotNumber") || "").trim(),
      supplierId: String(formData.get("supplierId") || ""),
      purchaseDate: String(formData.get("purchaseDate") || ""),
      note: String(formData.get("note") || "").trim() || null,
    };
    if (!next.lotNumber || !next.supplierId || !next.purchaseDate) return { ok: false, error: "Lot number, supplier and start date are required." };
    const changes = diffFields({ lotNumber: current.lotNumber, supplierId: current.supplierId, purchaseDate: current.purchaseDate, note: current.note }, next);
    const sensitive = changes.filter((change) => change.field !== "note");
    const guard = await requireReauthWhen(formData, sensitive.length > 0);
    if (!guard.ok) return guard;
    if (next.lotNumber !== current.lotNumber && (await prisma.lot.findUnique({ where: { lotNumber: next.lotNumber }, select: { id: true } }))) {
      return { ok: false, error: `Lot number ${next.lotNumber} is already used by another lot.` };
    }
    await prisma.lot.update({ where: { id: params.id }, data: { ...next, purchaseDate: new Date(next.purchaseDate) } });
    if (sensitive.length) {
      const actor = await getServerSession(authOptions);
      await auditChange("SensitiveEdit", "Lot", params.id, actor?.user?.id, { changes });
    }
    revalidatePath(`/lots/${params.id}`);
    revalidatePath("/lots");
    return { ok: true };
  }

  // Payments are money records: editing the amount/date or deleting one needs review + password,
  // and the lot's paid total and payment status are recomputed from all its payments.
  async function updateLotPayment(formData: FormData): Promise<ActionResult> {
    "use server";
    const id = String(formData.get("id") || "");
    const payment = await prisma.lotPayment.findUnique({ where: { id } });
    if (!payment || payment.lotId !== params.id) return { ok: false, error: "Payment not found." };
    const methodInput = String(formData.get("method") || "");
    const next = {
      amount: Number(formData.get("amount") || 0),
      paidAt: String(formData.get("paidAt") || ""),
      method: (["Cash", "Card", "BankTransfer", "Cheque", "UPI", "Other"].includes(methodInput) ? methodInput : null) as "Cash" | "Card" | "BankTransfer" | "Cheque" | "UPI" | "Other" | null,
      reference: String(formData.get("reference") || "").trim() || null,
    };
    if (!(next.amount > 0)) return { ok: false, error: "Amount must be greater than zero." };
    if (!next.paidAt) return { ok: false, error: "Date is required." };
    const changes = diffFields({ amount: payment.amount, paidAt: payment.paidAt, method: payment.method, reference: payment.reference }, next);
    const sensitive = changes.filter((change) => change.field === "amount" || change.field === "paidAt");
    const guard = await requireReauthWhen(formData, sensitive.length > 0);
    if (!guard.ok) return guard;
    await prisma.$transaction(async (tx) => {
      await tx.lotPayment.update({ where: { id }, data: { ...next, paidAt: new Date(next.paidAt) } });
      await recomputeLotPayments(params.id, tx);
    });
    if (sensitive.length) {
      const actor = await getServerSession(authOptions);
      await auditChange("SensitiveEdit", "LotPayment", id, actor?.user?.id, { lotId: params.id, changes });
    }
    revalidatePath(`/lots/${params.id}`);
    revalidatePath("/lots");
    revalidatePath("/dashboard");
    return { ok: true };
  }

  async function deleteLotPayment(formData: FormData): Promise<ActionResult> {
    "use server";
    const actor = await getServerSession(authOptions);
    if (!canViewCost(actor?.user?.role as "admin" | "manager" | "staff" | undefined)) return { ok: false, error: "Only admins and managers can delete payments." };
    const guard = await requireReauthWhen(formData, true);
    if (!guard.ok) return guard;
    const id = String(formData.get("id") || "");
    const owned = await prisma.lotPayment.findFirst({ where: { id, lotId: params.id, deletedAt: null }, select: { id: true } });
    if (!owned) return { ok: false, error: "Payment not found." };
    // Soft delete: the payment goes to the Recycle Bin and the lot's paid total is recomputed.
    const result = await softDeleteLotPayment(id);
    if (!result.ok) return result;
    const payment = result.payment;
    await auditChange("SensitiveDelete", "LotPayment", id, actor?.user?.id, { lotId: params.id, amount: Number(payment.amount), paidAt: payment.paidAt.toISOString().slice(0, 10), method: payment.method, reference: payment.reference });
    revalidatePath(`/lots/${params.id}`);
    revalidatePath("/lots");
    revalidatePath("/dashboard");
    revalidatePath("/recycle-bin");
    revalidatePath("/suppliers", "layout");
    return { ok: true };
  }

  async function deleteLot(formData: FormData): Promise<ActionResult> {
    "use server";
    const check = await checkReauth(formData);
    if (!check.ok) return check;
    const cascade = formData.get("cascade") === "1";
    const impact = await lotDeleteImpact(params.id);
    const result = await softDeleteLot(params.id, { cascade });
    if (!result.ok) return result;
    const actor = await getServerSession(authOptions);
    await auditChange("SensitiveDelete", "Lot", params.id, actor?.user?.id, { cascade, units: result.units, soldUnits: impact?.sold ?? 0, deleted: impact?.deleted ?? [], kept: impact?.kept ?? [] });
    revalidatePath("/lots");
    revalidatePath("/recycle-bin");
    revalidatePath("/items/phones");
    revalidatePath("/dashboard");
    return { ok: true };
  }

  async function editUnit(formData: FormData): Promise<ActionResult> {
    "use server";
    const actor = await getServerSession(authOptions);
    const result = await editPhoneUnit(formData, { userId: actor?.user?.id, canEditCost: canViewCost(actor?.user?.role as "admin" | "manager" | "staff" | undefined) });
    if (result.ok) {
      revalidatePath("/lots", "layout"); // a lot move changes both lots
      revalidatePath("/items/phones");
      revalidatePath("/items/phones/price-history");
      revalidatePath("/dashboard");
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
      revalidatePath(`/lots/${params.id}`);
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
    return withErrorLog("lots/detail: addAccessoryToLot", formData, async () => {
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
    });
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
      <PageHeader
        title={`Lot ${lot.lotNumber}`}
        subtitle={`Supplied by ${lot.supplier.name}`}
        help={
          <>
            <p>A lot moves through three stages: Collection (add phones/accessories, goods cost builds up automatically) → Shipped (add shipping cost) → Cleared (add tax/customs/other charges).</p>
            <p className="mt-2">Only the card for the lot&apos;s current stage is shown — once you move it forward, use &quot;Correct a Charge&quot; below if you need to fix an earlier value.</p>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/lots" className="text-sm text-slate-700 underline">Back to Lots</Link>
        <div className="flex flex-wrap items-center gap-2">
        <BookmarkButton lotId={lot.id} bookmarked={bookmarked} action={toggleBookmark} withLabel />
        <EntityEditButton
          title={`Edit lot ${lot.lotNumber}`}
          subtitle="Lot number, supplier and start date are sensitive — changing them needs your password"
          action={updateLotDetails}
          username={username}
          label="Edit details"
          buttonClassName="btn btn-sm btn-secondary"
          fields={[
            { name: "lotNumber", label: "Lot number", value: lot.lotNumber, required: true, sensitive: true },
            { name: "supplierId", label: "Supplier", value: lot.supplierId, type: "select", options: supplierOptions.map((supplier) => ({ value: supplier.id, label: supplier.name })), sensitive: true },
            { name: "purchaseDate", label: "Start date", value: lot.purchaseDate.toISOString().slice(0, 10), type: "date", required: true, sensitive: true },
            { name: "note", label: "Note", value: lot.note ?? "", type: "textarea" },
          ]}
        />
        <EntityDeleteButton
          label={deleteImpact?.sold ? "Delete lot + everything" : "Delete lot"}
          title={deleteImpact?.sold ? `Delete lot ${lot.lotNumber} and everything in it?` : `Delete lot ${lot.lotNumber}?`}
          sensitive
          username={username}
          fields={{ id: lot.id, cascade: deleteImpact?.sold ? "1" : "0" }}
          action={deleteLot}
          confirmLabel={deleteImpact?.sold ? "Delete lot and its units" : "Delete lot"}
          redirectTo="/lots"
          buttonClassName="btn btn-sm btn-danger"
          consequences={[
            ...(deleteImpact?.deleted ?? []),
            ...(deleteImpact?.sold ? [`${deleteImpact.sold} of these units were sold — they're deleted too, but the sales keep showing them.`] : []),
            "Everything deleted here stays in the Recycle Bin for 30 days. There you can restore the lot with all, some or none of its units.",
          ]}
          kept={deleteImpact?.kept}
        />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-xs font-semibold uppercase text-slate-500">Supplier</p>
          <p className="mt-2 font-semibold text-slate-900"><EntityLink kind="supplier" id={lot.supplierId}>{lot.supplier.name}</EntityLink></p>
          <p className="mt-1 text-sm text-slate-700">{lot.supplier.phone || lot.supplier.email || "No contact details"}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase text-slate-500">Collection</p>
          <p className="mt-2 text-sm text-slate-700">Start date: {lot.purchaseDate.toISOString().slice(0, 10)}</p>
          <p className="text-sm text-slate-700">Units: {units}</p>
        </Card>
        {showCost ? (
          <Card>
            <p className="text-xs font-semibold uppercase text-slate-500">Landed Cost</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{formatMoney(landedPerUnit)}/unit</p>
            <p className="text-sm text-slate-700">Shipping {formatMoney(lot.shippingCost)} · Tax {formatMoney(lot.taxCost)} · Customs {formatMoney(lot.customsCost)} · Other {formatMoney(lot.otherCost)}</p>
          </Card>
        ) : null}
        <Card>
          <p className="text-xs font-semibold uppercase text-slate-500">Payment</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${lot.status === "Cleared" ? "bg-sky-100 text-sky-800" : lot.status === "Shipped" ? "bg-indigo-100 text-indigo-800" : "bg-slate-200 text-slate-700"}`}>{lot.status}</span>
            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${lot.paymentStatus === "Paid" ? "bg-green-100 text-green-800" : lot.paymentStatus === "Partial" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>{lot.paymentStatus}</span>
          </div>
          {showCost ? (
            <>
              <p className="mt-2 text-sm text-slate-700">Goods cost: {formatMoney(goodsCost)}</p>
              <p className="text-sm text-slate-700">Total cost: {formatMoney(totalCost)}</p>
              <p className="text-sm text-slate-700">Paid: {formatMoney(lot.amountPaid)}</p>
              <p className="text-sm font-medium text-slate-900">Remaining: {formatMoney(remaining)}</p>
            </>
          ) : null}
        </Card>
      </div>

      {lot.status === "Collection" ? (
        <Card className="mt-4 border-indigo-300">
          <h2 className="mb-1 flex items-center gap-1.5 text-lg font-semibold">
            Move to Shipped
            <InfoHelp size="sm" title="Move to Shipped">
              This is the only cost you enter for the Shipped stage. It can be entered in a foreign currency — tick &quot;Foreign currency?&quot; and give the amount and conversion rate, and it converts to LKR automatically.
            </InfoHelp>
          </h2>
          <p className="mb-3 text-sm text-slate-600">
            Once everything for this shipment has been collected, add the shipping cost to move the lot to Shipped. Goods
            cost above is the running total of every phone/accessory added below — nothing to type here for that.
          </p>
          <form action={moveToShipped} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <FxAmountInput name="shippingCost" label="Shipping cost" />
            <div className="flex items-end">
              <button className="btn btn-md btn-primary">Mark as Shipped</button>
            </div>
          </form>
        </Card>
      ) : null}

      {lot.status === "Shipped" ? (
        <Card className="mt-4 border-amber-300">
          <h2 className="mb-1 flex items-center gap-1.5 text-lg font-semibold">
            Clearance Charges
            <InfoHelp size="sm" title="Clearance Charges">
              Marking a lot Cleared unlocks phone grading below. Each charge can be entered in a foreign currency — tick &quot;Foreign currency?&quot; on it for a foreign amount + conversion rate instead of typing the LKR value directly.
            </InfoHelp>
          </h2>
          <p className="mb-3 text-sm text-slate-600">This lot was recorded as Shipped with just its goods and shipping cost. Once customs clears it, add the tax/customs/other charges here to mark it Cleared.</p>
          <form action={markLotCleared} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <FxAmountInput name="taxCost" label="Tax cost" />
            <FxAmountInput name="customsCost" label="Customs clearance charges" />
            <FxAmountInput name="otherCost" label="Other charges" />
            <button className="btn btn-md btn-primary md:col-span-2 xl:col-span-3">Mark as Cleared</button>
          </form>
        </Card>
      ) : null}

      {showCost && lot.status !== "Collection" ? (
        <Card className="mt-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-lg font-semibold">
            Correct a Charge
            <InfoHelp size="sm" title="Correct a Charge">
              Fix a shipping or clearance charge you already entered for an earlier stage. If the lot has moved on since that charge was normally entered, you&apos;ll be asked to re-confirm your own password before it saves, as a guard against accidental edits.
            </InfoHelp>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <LotChargeEditor
              title="Shipping Cost"
              fields={[{ name: "shippingCost", label: "Shipping cost", defaultValue: Number(lot.shippingCost) }]}
              requireReauth={requireShippingReauth}
              username={username}
              action={editShippingCost}
            />
            {lot.status === "Cleared" ? (
              <LotChargeEditor
                title="Clearance Charges"
                fields={[
                  { name: "taxCost", label: "Tax cost", defaultValue: Number(lot.taxCost) },
                  { name: "customsCost", label: "Customs clearance charges", defaultValue: Number(lot.customsCost) },
                  { name: "otherCost", label: "Other charges", defaultValue: Number(lot.otherCost) },
                ]}
                requireReauth={false}
                username={username}
                action={editClearanceCharges}
              />
            ) : null}
          </div>
        </Card>
      ) : null}

      {showCost ? (
        <Card className="mt-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-lg font-semibold">
            Record a Payment
            <InfoHelp size="sm" title="Record a Payment">
              Log what you&apos;ve paid the supplier toward this lot&apos;s total cost. You can attach a photo or PDF of the payment slip as proof — it&apos;s kept alongside the payment record below.
            </InfoHelp>
          </h2>
          <form action={recordLotPayment} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid min-w-0 gap-1 text-sm text-slate-700">
              Amount
              <input name="amount" type="number" step="0.01" min={0.01} required placeholder={`Remaining: ${formatMoney(remaining)}`} className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
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
            <label className="grid min-w-0 gap-1 text-sm text-slate-700 md:col-span-2 xl:col-span-4">
              Payment slip (optional)
              <input name="proofFile" type="file" accept="image/*,application/pdf" className="w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2" />
            </label>
            <button className="btn btn-md btn-primary md:col-span-2 xl:col-span-4">Record Payment</button>
          </form>

          {lot.payments.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2">Amount</th>
                    <th className="px-2 py-2">Method</th>
                    <th className="px-2 py-2">Reference</th>
                    <th className="px-2 py-2">Slip</th>
                    <th className="px-2 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {lot.payments.map((payment, i) => (
                    <tr key={payment.id} className="border-b border-slate-200">
                      <td className="px-2 py-2">{payment.paidAt.toISOString().slice(0, 10)}</td>
                      <td className="px-2 py-2">{formatMoney(payment.amount)}</td>
                      <td className="px-2 py-2">{payment.method || "-"}</td>
                      <td className="px-2 py-2">{payment.reference || "-"}</td>
                      <td className="px-2 py-2">
                        {paymentProofLinks[i] ? (
                          <a href={paymentProofLinks[i] as string} target="_blank" rel="noreferrer" className="text-slate-800 underline">View</a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          <EntityEditButton
                            title="Edit supplier payment"
                            subtitle={`${formatMoney(payment.amount)} on ${payment.paidAt.toISOString().slice(0, 10)}`}
                            hidden={{ id: payment.id }}
                            action={updateLotPayment}
                            username={username}
                            fields={[
                              { name: "amount", label: "Amount", value: String(Number(payment.amount)), type: "number", money: true, sensitive: true, required: true },
                              { name: "paidAt", label: "Date", value: payment.paidAt.toISOString().slice(0, 10), type: "date", sensitive: true, required: true },
                              { name: "method", label: "Method", value: payment.method ?? "", type: "select", options: [{ value: "", label: "Not set" }, ...["Cash", "Card", "BankTransfer", "Cheque", "UPI", "Other"].map((value) => ({ value, label: value === "BankTransfer" ? "Bank transfer" : value }))] },
                              { name: "reference", label: "Reference", value: payment.reference ?? "" },
                            ]}
                          />
                          <EntityDeleteButton
                            title={`Delete payment of ${formatMoney(payment.amount)}?`}
                            sensitive
                            username={username}
                            fields={{ id: payment.id }}
                            action={deleteLotPayment}
                            consequences={[
                              `Paid to the supplier drops from ${formatMoney(lot.amountPaid)} to ${formatMoney(Number(lot.amountPaid) - Number(payment.amount))}; remaining owed rises to ${formatMoney(Math.max(0, totalCost - (Number(lot.amountPaid) - Number(payment.amount))))}.`,
                              `The lot's payment status is recalculated (currently ${lot.paymentStatus}).`,
                              paymentProofLinks[i] ? "Its attached payment slip goes with it and comes back if you restore it." : "No payment slip is attached.",
                              "The payment goes to the Recycle Bin for 30 days — restoring it puts the money back on this lot. The deletion is recorded in the activity log.",
                            ]}
                          />
                        </div>
                      </td>
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

      {showCost ? (
        <Card className="mt-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-lg font-semibold">
            Lot Performance
            <InfoHelp size="sm" title="Lot Performance">
              How this lot is doing so far: how much of it has sold, its return/damage rate, and the profit realized on units sold to date. Unsold units aren&apos;t counted in the P&amp;L yet.
            </InfoHelp>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">Sold / In Stock</p>
              <p className="mt-1 text-sm text-slate-700">{soldPhones.length} sold · {inStockCount} in stock</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">Damaged</p>
              <p className="mt-1 text-sm text-slate-700">{damagedCount} unit{damagedCount === 1 ? "" : "s"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">Return Rate</p>
              <p className="mt-1 text-sm text-slate-700">{returnRate.toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">Stock Depletion</p>
              <p className="mt-1 text-sm text-slate-700">{depletionRate.toFixed(1)}% · {velocityPerDay.toFixed(2)} units/day</p>
            </div>
          </div>
          <div className="mt-3 border-t border-slate-200 pt-3">
            <p className="text-xs font-semibold uppercase text-slate-500">Realized P&amp;L (sold units only)</p>
            <p className="mt-1 text-sm text-slate-700">Revenue {formatMoney(revenueFromLot)} − Cost {formatMoney(costOfSoldUnits + allocatedLandedCost)}</p>
            <p className={`text-lg font-semibold ${lotProfit >= 0 ? "text-green-700" : "text-red-700"}`}>{formatMoney(lotProfit)}</p>
          </div>
        </Card>
      ) : null}

      <Card className="mt-4">
        <h2 className="mb-3 flex items-center gap-1.5 text-lg font-semibold">
          Register Phones in This Lot
          <InfoHelp size="sm" title="Register Phones in This Lot">
            This is how goods cost builds up during Collection. Purchase/tag/battery costs each support foreign-currency entry — tick &quot;Foreign currency?&quot; on a field to enter a foreign amount and conversion rate instead of the LKR value.
          </InfoHelp>
        </h2>
        <p className="mb-3 text-sm text-slate-600">
          Pick a variant (search, or narrow by model, storage, RAM and color in the popup), scan or type each IMEI, and click
          Add to Batch — the variant stays selected so you can keep adding more units of it. Create a brand-new variant from
          the last option in the popup.
          {!canGrade ? " Phones aren't graded yet — grading opens up once this lot is Cleared." : ""}
        </p>
        <LotRegisterForm
          variants={variants.map((variant) => ({
            id: variant.id,
            phoneModelId: variant.phoneModelId,
            brand: variant.phoneModel.brand,
            modelName: variant.phoneModel.modelName,
            variantName: variant.variantName,
            color: variant.color,
            storage: variant.storage,
            ram: variant.ram,
            defaultTagCost: Number(variant.defaultTagCost),
            defaultBatteryCost: Number(variant.defaultBatteryCost),
          }))}
          imeiOwners={allPhones}
          showCost={showCost}
          allowGrading={canGrade}
          action={registerPhonesBatch}
          createVariant={createVariantForLot}
          models={models.map((model) => ({ id: model.id, label: `${model.brand} ${model.modelName}` }))}
          modelQuickAdd={{ label: "Model", action: createModelForLot, fields: [{ name: "brand", label: "Brand", required: true }, { name: "modelName", label: "Model name", required: true }] }}
        />
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 flex items-center gap-1.5 text-lg font-semibold">
          Units in This Lot
          <InfoHelp size="sm" title="Units in This Lot">
            Every phone registered to this lot. Grading only becomes available once the lot is Cleared. Editing a unit&apos;s cost after Collection has ended asks you to re-confirm your password first. Edit opens the full unit editor: change its variant (or move it to another model), IMEI, grade, notes and prices.
          </InfoHelp>
        </h2>
        <p className="mb-3 text-sm text-slate-600">Click a row to see its cost and profit breakdown.</p>
        <UnitEditProvider
          variants={variants.map((variant) => ({ id: variant.id, phoneModelId: variant.phoneModelId, brand: variant.phoneModel.brand, modelName: variant.phoneModel.modelName, variantName: variant.variantName, color: variant.color, storage: variant.storage, ram: variant.ram }))}
          username={username}
          action={editUnit}
          checkImei={checkImei}
          lots={showCost ? (await prisma.lot.findMany({ where: { deletedAt: null }, orderBy: { purchaseDate: "desc" }, select: { id: true, lotNumber: true, status: true, supplier: { select: { name: true } } } })).map((item) => ({ id: item.id, label: `${item.lotNumber} — ${item.supplier.name}`, status: item.status })) : undefined}
          expenses={showCost ? { list: listUnitExpenses, add: addUnitExpense, categories: await expenseCategories() } : undefined}
          createVariant={{ action: createVariantForLot, models: models.map((model) => ({ id: model.id, label: `${model.brand} ${model.modelName}` })) }}
        >
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">IMEI</th>
                <th className="px-2 py-2">Model</th>
                <th className="px-2 py-2">Variant</th>
                <th className="px-2 py-2">Grade</th>
                <th className="px-2 py-2">Battery</th>
                <th className="px-2 py-2">Status</th>
                {showCost ? <th className="px-2 py-2">Purchase Price</th> : null}
                {showCost ? <th className="px-2 py-2">Tag Cost</th> : null}
                {showCost ? <th className="px-2 py-2">Battery Cost</th> : null}
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {lot.phones.map((phone) => (
                <PhoneCostEditor
                  editUnit={{
                    id: phone.id,
                    imei: phone.imei,
                    phoneVariantId: phone.phoneVariantId,
                    lotStatus: lot.status,
                    lotNumber: lot.lotNumber,
                    lotId: lot.id,
                    status: phone.status,
                    grade: phone.grade,
                    batteryHealth: phone.batteryHealth,
                    notes: phone.notes,
                    ...(showCost
                      ? { prices: { purchasePrice: Number(phone.purchasePrice), wholesalePrice: Number(phone.wholesalePrice ?? 0), retailPrice: Number(phone.retailPrice ?? 0), tagCost: Number(phone.tagCost), batteryCost: Number(phone.batteryCost) } }
                      : {}),
                  }}
                  key={phone.id}
                  phone={{
                    id: phone.id,
                    imei: phone.imei,
                    notes: phone.notes,
                    grade: phone.grade,
                    batteryHealth: phone.batteryHealth,
                    status: phone.status,
                    purchasePrice: Number(phone.purchasePrice),
                    wholesalePrice: phone.wholesalePrice !== null ? Number(phone.wholesalePrice) : null,
                    retailPrice: phone.retailPrice !== null ? Number(phone.retailPrice) : null,
                    tagCost: Number(phone.tagCost),
                    batteryCost: Number(phone.batteryCost),
                    phoneVariant: { id: phone.phoneVariantId, phoneModelId: phone.phoneVariant.phoneModelId, variantName: phone.phoneVariant.variantName, specs: formatVariantSpecs(phone.phoneVariant), color: phone.phoneVariant.color, storage: phone.phoneVariant.storage, ram: phone.phoneVariant.ram, phoneModel: { brand: phone.phoneVariant.phoneModel.brand, modelName: phone.phoneVariant.phoneModel.modelName } },
                    expenses: expensesByPhone.get(phone.id) ?? [],
                  }}
                  showCost={showCost}
                  canGrade={canGrade}
                  requireReauth={requirePhoneCostReauth}
                  username={username}
                  updateAction={updatePhoneCosts}
                  checkImei={checkImei}
                  archiveAction={archivePhone}
                />
              ))}
              {!lot.phones.length ? (
                <tr>
                  <td className="px-2 py-4 text-slate-600" colSpan={showCost ? 10 : 7}>
                    No units registered in this lot yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        </UnitEditProvider>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-1 flex items-center gap-1.5 text-lg font-semibold">
          Sold Items From This Lot
          <InfoHelp size="sm" title="Sold Items From This Lot">
            Every sale line that sold a phone from this lot, newest first. Click the sale number to see the sale in a popup — use <b>Open</b> in the popup for the full sale page (payments, receipt, invoice). Click the customer or phone to see their details.
            {showCost ? " Profit is the sold price minus the unit's own costs and its share of the lot's landed charges." : ""}
          </InfoHelp>
        </h2>
        <p className="mb-3 text-sm text-slate-600">
          {lotSaleItems.length} sale line{lotSaleItems.length === 1 ? "" : "s"} · {formatMoney(lotSaleItems.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0))} sold
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-2 py-2">Sale</th>
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Customer</th>
                <th className="px-2 py-2">Phone</th>
                <th className="px-2 py-2">IMEI</th>
                <th className="px-2 py-2 text-right">Sold for</th>
                {showCost ? <th className="px-2 py-2 text-right">Profit</th> : null}
                <th className="px-2 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {lotSaleItems.map((item) => {
                const variant = item.phone?.phoneVariant;
                const soldFor = Number(item.unitPrice) * item.quantity;
                const unitCost = item.phone ? Number(item.phone.purchasePrice) + Number(item.phone.tagCost) + Number(item.phone.batteryCost) + Number(item.phone.repairCost) + landedPerUnit : 0;
                const profit = soldFor - unitCost * item.quantity;
                const returned = Boolean(item.phoneId && returnedPhoneIds.has(item.phoneId));
                return (
                  <tr key={item.id} className="border-b border-slate-100 align-top">
                    <td className="whitespace-nowrap px-2 py-2 font-medium"><EntityLink kind="sale" id={item.sale.id}>{item.sale.saleNumber}</EntityLink></td>
                    <td className="whitespace-nowrap px-2 py-2 text-slate-700">{item.sale.saleDate.toISOString().slice(0, 10)}</td>
                    <td className="px-2 py-2">{item.sale.customerId ? <EntityLink kind="customer" id={item.sale.customerId}>{item.sale.customer?.name ?? "Customer"}</EntityLink> : <span className="text-slate-500">Walk-in</span>}</td>
                    <td className="px-2 py-2">
                      {item.phoneId && variant ? (
                        <EntityLink kind="phone" id={item.phoneId}>{variant.phoneModel.brand} {variant.phoneModel.modelName} {variant.variantName}</EntityLink>
                      ) : "—"}
                      {variant ? <span className="block text-xs text-slate-500">{formatVariantSpecs(variant)}</span> : null}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 font-mono text-xs text-slate-700">{item.phone?.imei ?? "—"}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right">{formatMoney(soldFor)}</td>
                    {showCost ? <td className={`whitespace-nowrap px-2 py-2 text-right font-medium ${profit >= 0 ? "text-emerald-700" : "text-red-700"}`}>{formatMoney(profit)}</td> : null}
                    <td className="whitespace-nowrap px-2 py-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{item.sale.status}</span>
                      {returned ? <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">Returned</span> : null}
                    </td>
                  </tr>
                );
              })}
              {lotSaleItems.length === 0 ? (
                <tr>
                  <td className="px-2 py-4 text-slate-600" colSpan={showCost ? 8 : 7}>
                    Nothing from this lot has been sold yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 flex items-center gap-1.5 text-lg font-semibold">
          Add Accessories to This Lot
          <InfoHelp size="sm" title="Add Accessories to This Lot">
            Accessories aren&apos;t serialized, so they&apos;re added by quantity and immediately increase that item&apos;s stock count. Unit cost supports foreign-currency entry the same way phone costs do.
          </InfoHelp>
        </h2>
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
          {showCost ? <FxAmountInput name="unitCost" label="Unit cost" /> : null}
          <button className="btn btn-md btn-primary md:col-span-2 xl:col-span-4">Add to Lot</button>
        </form>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
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
              {lot.accessoryItems.map((item) => {
                const rowCells = (
                  <>
                    <td className="px-2 py-2">{item.accessory.name}</td>
                    <td className="px-2 py-2">{item.accessory.sku}</td>
                    <td className="px-2 py-2">{item.quantity}</td>
                    {showCost ? <td className="px-2 py-2">{formatMoney(item.unitCost)}</td> : null}
                    {showCost ? <td className="px-2 py-2">{formatMoney(Number(item.unitCost) * item.quantity)}</td> : null}
                    <td className="px-2 py-2">{item.createdAt.toISOString().slice(0, 10)}</td>
                    <NoModalCell className="px-2 py-2">
                      <form action={removeAccessoryFromLot}>
                        <input type="hidden" name="id" value={item.id} />
                        <button className="btn btn-xs btn-danger">Remove</button>
                      </form>
                    </NoModalCell>
                  </>
                );
                if (!showCost) {
                  return <tr key={item.id} className="border-b border-slate-200">{rowCells}</tr>;
                }
                return (
                  <CostRow
                    key={item.id}
                    className="border-b border-slate-200"
                    data={{
                      name: `${item.accessory.name} (${item.accessory.sku})`,
                      unitCost: Number(item.unitCost),
                      totalCost: Number(item.unitCost),
                      wholesalePrice: Number(item.accessory.wholesalePrice),
                      retailPrice: Number(item.accessory.retailPrice),
                      details: [
                        { label: "Item", value: item.accessory.name },
                        { label: "SKU", value: item.accessory.sku },
                        { label: "Quantity in this lot", value: String(item.quantity) },
                        { label: "Added", value: item.createdAt.toISOString().slice(0, 10) },
                      ],
                      expenses: (expensesByAccessory.get(item.accessoryId) ?? []).map((expense) => ({
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
