"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewCost } from "@/lib/rbac";
import { formatMoney } from "@/lib/currency";
import { formatPhoneName } from "@/lib/format-item-name";
import { auditChange, diffFields, requireReauthWhen } from "@/lib/entity-guard";
import { normalizeVariantInput } from "@/lib/phone-variants";
import type { EditorField } from "@/components/ui/entity-editor";
import type { EntityKind, PeekData } from "@/lib/entity-peek-types";

type Result = { ok: true } | { ok: false; error: string };

async function viewer() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.error) return null;
  return { userId: session.user.id, username: session.user.username, showCost: canViewCost(session.user.role as "admin" | "manager" | "staff") };
}

const day = (date: Date | null | undefined) => (date ? date.toISOString().slice(0, 10) : "—");
const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const optional = (formData: FormData, key: string) => text(formData, key) || null;

/**
 * Summary of any linked record for the details popup — key facts, a link to its page and, where
 * editing makes sense, the editable fields (sensitive ones flagged for the review step).
 */
export async function peekEntity(kind: EntityKind, id: string): Promise<PeekData | null> {
  const actor = await viewer();
  if (!actor) return null;

  switch (kind) {
    case "lot": {
      const lot = await prisma.lot.findUnique({ where: { id }, include: { supplier: true, phones: { where: { deletedAt: null }, select: { status: true, purchasePrice: true } }, _count: { select: { payments: { where: { deletedAt: null } } } } } });
      if (!lot) return null;
      const suppliers = await prisma.supplier.findMany({ where: { OR: [{ deletedAt: null }, { id: lot.supplierId }] }, orderBy: { name: "asc" }, select: { id: true, name: true } });
      const inStock = lot.phones.filter((phone) => phone.status === "InStock").length;
      const sold = lot.phones.filter((phone) => phone.status === "Sold").length;
      return {
        kind,
        id,
        title: `Lot ${lot.lotNumber}`,
        subtitle: `${lot.status} · ${lot.paymentStatus}`,
        href: `/lots/${lot.id}`,
        deleted: Boolean(lot.deletedAt),
        facts: [
          { label: "Supplier", value: lot.supplier.name, link: { kind: "supplier", id: lot.supplierId } },
          { label: "Start date", value: day(lot.purchaseDate) },
          { label: "Units", value: `${lot.phones.length} (${inStock} in stock, ${sold} sold)` },
          { label: "Payments recorded", value: String(lot._count.payments) },
          ...(actor.showCost ? [{ label: "Paid to supplier", value: formatMoney(lot.amountPaid) }] : []),
          ...(lot.note ? [{ label: "Note", value: lot.note }] : []),
        ],
        edit: lot.deletedAt
          ? undefined
          : {
              title: `Edit lot ${lot.lotNumber}`,
              fields: [
                { name: "lotNumber", label: "Lot number", value: lot.lotNumber, required: true, sensitive: true },
                { name: "supplierId", label: "Supplier", value: lot.supplierId, type: "select", options: suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name })), sensitive: true },
                { name: "purchaseDate", label: "Start date", value: day(lot.purchaseDate), type: "date", required: true, sensitive: true },
                { name: "note", label: "Note", value: lot.note ?? "", type: "textarea" },
              ],
            },
        username: actor.username,
      };
    }
    case "supplier": {
      const supplier = await prisma.supplier.findUnique({ where: { id }, include: { lots: { where: { deletedAt: null }, select: { id: true, lotNumber: true }, orderBy: { purchaseDate: "desc" } } } });
      if (!supplier) return null;
      return {
        kind,
        id,
        title: supplier.name,
        subtitle: "Supplier",
        href: `/suppliers/${supplier.id}`,
        deleted: Boolean(supplier.deletedAt),
        facts: [
          { label: "Phone", value: supplier.phone || "—" },
          { label: "Email", value: supplier.email || "—" },
          { label: "Address", value: supplier.address || "—" },
          { label: "Lots", value: supplier.lots.length ? supplier.lots.slice(0, 6).map((lot) => lot.lotNumber).join(", ") + (supplier.lots.length > 6 ? ` +${supplier.lots.length - 6} more` : "") : "None" },
        ],
        edit: supplier.deletedAt
          ? undefined
          : {
              title: "Edit supplier",
              fields: [
                { name: "name", label: "Name", value: supplier.name, required: true, wide: true },
                { name: "phone", label: "Phone", value: supplier.phone ?? "", type: "tel" },
                { name: "email", label: "Email", value: supplier.email ?? "", type: "email" },
                { name: "address", label: "Address", value: supplier.address ?? "", type: "textarea" },
              ],
            },
        username: actor.username,
      };
    }
    case "customer": {
      const customer = await prisma.customer.findUnique({ where: { id }, include: { sales: { where: { status: "Completed" }, select: { totalAmount: true } } } });
      if (!customer) return null;
      return {
        kind,
        id,
        title: customer.name,
        subtitle: "Customer",
        href: `/customers/${customer.id}`,
        deleted: Boolean(customer.deletedAt),
        facts: [
          { label: "Phone", value: customer.phone || "—" },
          { label: "Email", value: customer.email || "—" },
          { label: "Address", value: customer.address || "—" },
          { label: "Completed sales", value: `${customer.sales.length} · ${formatMoney(customer.sales.reduce((sum, sale) => sum + Number(sale.totalAmount), 0))}` },
        ],
        edit: customer.deletedAt
          ? undefined
          : {
              title: "Edit customer",
              fields: [
                { name: "name", label: "Name", value: customer.name, required: true, wide: true },
                { name: "phone", label: "Phone", value: customer.phone ?? "", type: "tel" },
                { name: "email", label: "Email", value: customer.email ?? "", type: "email" },
                { name: "address", label: "Address", value: customer.address ?? "", type: "textarea" },
              ],
            },
        username: actor.username,
      };
    }
    case "model": {
      const model = await prisma.phoneModel.findUnique({ where: { id }, include: { variants: { where: { deletedAt: null }, include: { _count: { select: { phones: { where: { deletedAt: null, status: "InStock" } } } } } } } });
      if (!model) return null;
      return {
        kind,
        id,
        title: `${model.brand} ${model.modelName}`,
        subtitle: "Phone model",
        href: `/items/phone-catalog?tab=models&search=${encodeURIComponent(model.modelName)}`,
        deleted: Boolean(model.deletedAt),
        facts: [
          { label: "In stock", value: String(model.variants.reduce((sum, variant) => sum + variant._count.phones, 0)) },
          { label: "Variants", value: model.variants.map((variant) => variant.variantName).join(", ") || "None" },
          { label: "Warranty", value: model.warrantyMonths ? `${model.warrantyMonths} months` : "None" },
          { label: "Low-stock alert at", value: String(model.lowStockThreshold) },
        ],
        edit: model.deletedAt
          ? undefined
          : {
              title: "Edit phone model",
              fields: [
                { name: "brand", label: "Brand", value: model.brand, required: true },
                { name: "modelName", label: "Model name", value: model.modelName, required: true },
                { name: "lowStockThreshold", label: "Low stock threshold", value: String(model.lowStockThreshold), type: "number" },
                { name: "warrantyMonths", label: "Warranty (months)", value: String(model.warrantyMonths), type: "number" },
              ],
            },
        username: actor.username,
      };
    }
    case "variant": {
      const variant = await prisma.phoneVariant.findUnique({ where: { id }, include: { phoneModel: true, _count: { select: { phones: { where: { deletedAt: null, status: "InStock" } } } } } });
      if (!variant) return null;
      return {
        kind,
        id,
        title: formatPhoneName(variant),
        subtitle: "Phone variant",
        href: `/items/phones/variants/${variant.id}`,
        deleted: Boolean(variant.deletedAt),
        chips: { color: variant.color, storage: variant.storage, ram: variant.ram },
        facts: [
          { label: "Model", value: `${variant.phoneModel.brand} ${variant.phoneModel.modelName}`, link: { kind: "model", id: variant.phoneModelId } },
          { label: "In stock", value: String(variant._count.phones) },
          ...([["Screen", variant.screenSize], ["Processor", variant.processor], ["Camera", variant.camera], ["Battery", variant.battery], ["OS", variant.os], ["Network", variant.networkType]] as const)
            .filter(([, value]) => value)
            .map(([label, value]) => ({ label, value: value as string })),
          ...(actor.showCost ? [{ label: "Default tag / battery cost", value: `${formatMoney(variant.defaultTagCost)} / ${formatMoney(variant.defaultBatteryCost)}` }] : []),
        ],
        edit: variant.deletedAt
          ? undefined
          : {
              title: "Edit variant",
              fields: [
                { name: "storage", label: "Storage", value: variant.storage ?? "" },
                { name: "ram", label: "RAM", value: variant.ram ?? "" },
                { name: "color", label: "Color", value: variant.color ?? "" },
                { name: "variantName", label: "Variant name (blank = built from specs)", value: variant.variantName },
                { name: "screenSize", label: "Screen", value: variant.screenSize ?? "" },
                { name: "processor", label: "Processor", value: variant.processor ?? "" },
                { name: "camera", label: "Camera", value: variant.camera ?? "" },
                { name: "battery", label: "Battery", value: variant.battery ?? "" },
                ...(actor.showCost
                  ? ([
                      { name: "defaultTagCost", label: "Default tag cost", value: String(Number(variant.defaultTagCost)), type: "number", money: true, sensitive: true },
                      { name: "defaultBatteryCost", label: "Default battery cost", value: String(Number(variant.defaultBatteryCost)), type: "number", money: true, sensitive: true },
                    ] as EditorField[])
                  : []),
              ],
            },
        username: actor.username,
      };
    }
    case "accessory": {
      const item = await prisma.accessory.findUnique({ where: { id } });
      if (!item) return null;
      return {
        kind,
        id,
        title: item.name,
        subtitle: `${item.category} · SKU ${item.sku}`,
        href: ({ Charger: "/items/chargers", Cable: "/items/cables", Handsfree: "/items/handsfree" } as Record<string, string>)[item.category] ?? "/items/other",
        deleted: Boolean(item.deletedAt),
        facts: [
          { label: "In stock", value: String(item.quantity) },
          { label: "Sold", value: String(item.soldQuantity) },
          { label: "Retail price", value: formatMoney(item.retailPrice) },
          ...(actor.showCost ? [{ label: "Wholesale / purchase", value: `${formatMoney(item.wholesalePrice)} / ${formatMoney(item.purchasePrice)}` }] : []),
          ...(item.notes ? [{ label: "Notes", value: item.notes }] : []),
        ],
        edit: item.deletedAt
          ? undefined
          : {
              title: `Edit ${item.name}`,
              fields: [
                { name: "name", label: "Name", value: item.name, required: true },
                { name: "sku", label: "SKU", value: item.sku, required: true },
                { name: "lowStockThreshold", label: "Low stock threshold", value: String(item.lowStockThreshold), type: "number" },
                ...(actor.showCost
                  ? ([
                      { name: "purchasePrice", label: "Purchase price", value: String(Number(item.purchasePrice)), type: "number", money: true, sensitive: true },
                      { name: "wholesalePrice", label: "Wholesale price", value: String(Number(item.wholesalePrice)), type: "number", money: true, sensitive: true },
                      { name: "retailPrice", label: "Retail price", value: String(Number(item.retailPrice)), type: "number", money: true, sensitive: true },
                    ] as EditorField[])
                  : []),
                { name: "notes", label: "Notes", value: item.notes ?? "", type: "textarea" },
              ],
            },
        username: actor.username,
      };
    }
    case "phone": {
      const phone = await prisma.phone.findUnique({ where: { id }, include: { lot: true, phoneVariant: { include: { phoneModel: true } } } });
      if (!phone) return null;
      return {
        kind,
        id,
        title: `IMEI ${phone.imei}`,
        subtitle: formatPhoneName(phone.phoneVariant),
        href: `/lots/${phone.lotId}`,
        deleted: Boolean(phone.deletedAt),
        chips: { color: phone.phoneVariant.color, storage: phone.phoneVariant.storage, ram: phone.phoneVariant.ram },
        facts: [
          { label: "Variant", value: phone.phoneVariant.variantName, link: { kind: "variant", id: phone.phoneVariantId } },
          { label: "Lot", value: phone.lot.lotNumber, link: { kind: "lot", id: phone.lotId } },
          { label: "Status", value: phone.status },
          { label: "Grade", value: phone.grade || "Not graded" },
          { label: "Battery health", value: phone.batteryHealth !== null ? `${phone.batteryHealth}%` : "—" },
          { label: "Retail price", value: formatMoney(phone.retailPrice ?? 0) },
          ...(actor.showCost ? [{ label: "Purchase price", value: formatMoney(phone.purchasePrice) }] : []),
          ...(phone.notes ? [{ label: "Notes", value: phone.notes }] : []),
        ],
        // Units have a richer editor (variant move, IMEI check, prices) — edited from their lot.
        editHint: "To edit this unit (variant, IMEI, prices), use Edit on its row in the lot or on the Phones page.",
        username: actor.username,
      };
    }
    case "sale": {
      const sale = await prisma.sale.findUnique({ where: { id }, include: { customer: true, invoice: true, _count: { select: { items: true } } } });
      if (!sale) return null;
      return {
        kind,
        id,
        title: `Sale ${sale.saleNumber}`,
        subtitle: `${sale.status} · ${sale.saleType}`,
        href: `/sales/${sale.id}`,
        facts: [
          { label: "Customer", value: sale.customer?.name || "Walk-in", ...(sale.customerId ? { link: { kind: "customer" as const, id: sale.customerId } } : {}) },
          { label: "Date", value: day(sale.saleDate) },
          { label: "Items", value: String(sale._count.items) },
          { label: "Total", value: formatMoney(sale.totalAmount) },
          { label: "Invoice", value: sale.invoice ? `${sale.invoice.invoiceNumber} · ${sale.invoice.status}` : "—" },
          ...(sale.invoice
            ? [
                { label: "Paid", value: formatMoney(sale.invoice.paidAmount) },
                { label: "Balance due", value: formatMoney(Math.max(0, Number(sale.totalAmount) - Number(sale.invoice.paidAmount))) },
              ]
            : []),
        ],
        editHint: "Sales aren't edited after they're completed — open the sale to record payments or void it.",
        username: actor.username,
      };
    }
    default:
      return null;
  }
}

/** Saves an edit made from a details popup, with the same sensitivity rules as the pages. */
export async function updateEntityAction(formData: FormData): Promise<Result> {
  const actor = await viewer();
  if (!actor) return { ok: false, error: "Sign in again." };
  const kind = text(formData, "__kind") as EntityKind;
  const id = text(formData, "__id");

  switch (kind) {
    case "supplier": {
      if (!text(formData, "name")) return { ok: false, error: "Name is required." };
      await prisma.supplier.update({ where: { id }, data: { name: text(formData, "name"), phone: optional(formData, "phone"), email: optional(formData, "email"), address: optional(formData, "address") } });
      revalidatePath("/suppliers");
      revalidatePath("/lots");
      break;
    }
    case "customer": {
      if (!text(formData, "name")) return { ok: false, error: "Name is required." };
      await prisma.customer.update({ where: { id }, data: { name: text(formData, "name"), phone: optional(formData, "phone"), email: optional(formData, "email"), address: optional(formData, "address") } });
      revalidatePath("/customers");
      revalidatePath("/sales");
      break;
    }
    case "model": {
      const brand = text(formData, "brand");
      const modelName = text(formData, "modelName");
      if (!brand || !modelName) return { ok: false, error: "Brand and model name are required." };
      const clash = await prisma.phoneModel.findFirst({ where: { brand, modelName, id: { not: id } }, select: { id: true } });
      if (clash) return { ok: false, error: `${brand} ${modelName} already exists.` };
      await prisma.phoneModel.update({ where: { id }, data: { brand, modelName, lowStockThreshold: Number(text(formData, "lowStockThreshold") || 0), warrantyMonths: Number(text(formData, "warrantyMonths") || 0) } });
      revalidatePath("/items/phones");
      revalidatePath("/items/phone-catalog");
      break;
    }
    case "variant": {
      const current = await prisma.phoneVariant.findUnique({ where: { id } });
      if (!current) return { ok: false, error: "Variant not found." };
      const specs = normalizeVariantInput({ variantName: text(formData, "variantName"), color: optional(formData, "color"), storage: optional(formData, "storage"), ram: optional(formData, "ram") });
      const clash = await prisma.phoneVariant.findFirst({ where: { phoneModelId: current.phoneModelId, variantName: specs.variantName, id: { not: id } }, select: { id: true } });
      if (clash) return { ok: false, error: `This model already has a variant named "${specs.variantName}".` };
      const costs = actor.showCost && formData.has("defaultTagCost") ? { defaultTagCost: Number(text(formData, "defaultTagCost") || 0), defaultBatteryCost: Number(text(formData, "defaultBatteryCost") || 0) } : {};
      const costChanges = diffFields({ defaultTagCost: current.defaultTagCost, defaultBatteryCost: current.defaultBatteryCost }, costs);
      const guard = await requireReauthWhen(formData, costChanges.length > 0);
      if (!guard.ok) return guard;
      await prisma.phoneVariant.update({
        where: { id },
        data: { ...specs, screenSize: optional(formData, "screenSize"), processor: optional(formData, "processor"), camera: optional(formData, "camera"), battery: optional(formData, "battery"), ...costs },
      });
      if (costChanges.length) await auditChange("SensitiveEdit", "PhoneVariant", id, actor.userId, { changes: costChanges });
      revalidatePath("/items/phones");
      revalidatePath(`/items/phones/variants/${id}`);
      revalidatePath("/items/phone-catalog");
      break;
    }
    case "accessory": {
      const current = await prisma.accessory.findUnique({ where: { id } });
      if (!current) return { ok: false, error: "Item not found." };
      const sku = text(formData, "sku");
      if (!text(formData, "name") || !sku) return { ok: false, error: "Name and SKU are required." };
      if (sku !== current.sku && (await prisma.accessory.findUnique({ where: { sku }, select: { id: true } }))) return { ok: false, error: `SKU ${sku} is already used.` };
      const prices = actor.showCost && formData.has("retailPrice") ? { purchasePrice: Number(text(formData, "purchasePrice") || 0), wholesalePrice: Number(text(formData, "wholesalePrice") || 0), retailPrice: Number(text(formData, "retailPrice") || 0) } : {};
      const priceChanges = diffFields({ purchasePrice: current.purchasePrice, wholesalePrice: current.wholesalePrice, retailPrice: current.retailPrice }, prices);
      const guard = await requireReauthWhen(formData, priceChanges.length > 0);
      if (!guard.ok) return guard;
      await prisma.accessory.update({ where: { id }, data: { name: text(formData, "name"), sku, lowStockThreshold: Number(text(formData, "lowStockThreshold") || 0), notes: optional(formData, "notes"), ...prices } });
      if (priceChanges.length) await auditChange("SensitiveEdit", "Accessory", id, actor.userId, { changes: priceChanges });
      revalidatePath("/items/chargers");
      revalidatePath("/items/cables");
      revalidatePath("/items/handsfree");
      revalidatePath("/items/other");
      break;
    }
    case "lot": {
      const current = await prisma.lot.findUnique({ where: { id } });
      if (!current || current.deletedAt) return { ok: false, error: "Lot not found." };
      const next = { lotNumber: text(formData, "lotNumber"), supplierId: text(formData, "supplierId"), purchaseDate: text(formData, "purchaseDate"), note: optional(formData, "note") };
      if (!next.lotNumber || !next.supplierId || !next.purchaseDate) return { ok: false, error: "Lot number, supplier and start date are required." };
      const changes = diffFields({ lotNumber: current.lotNumber, supplierId: current.supplierId, purchaseDate: current.purchaseDate, note: current.note }, next);
      const sensitive = changes.filter((change) => change.field !== "note");
      const guard = await requireReauthWhen(formData, sensitive.length > 0);
      if (!guard.ok) return guard;
      if (next.lotNumber !== current.lotNumber && (await prisma.lot.findUnique({ where: { lotNumber: next.lotNumber }, select: { id: true } }))) return { ok: false, error: `Lot number ${next.lotNumber} is already used.` };
      await prisma.lot.update({ where: { id }, data: { ...next, purchaseDate: new Date(next.purchaseDate) } });
      if (sensitive.length) await auditChange("SensitiveEdit", "Lot", id, actor.userId, { changes });
      revalidatePath("/lots");
      revalidatePath(`/lots/${id}`);
      break;
    }
    default:
      return { ok: false, error: "This record can't be edited from here." };
  }
  return { ok: true };
}

