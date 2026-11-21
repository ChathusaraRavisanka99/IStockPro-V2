import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { buildVariantName, normalizeColor, normalizeRam, normalizeStorage } from "@/lib/variant-specs";

export type VariantSpecInput = {
  phoneModelId: string;
  variantName: string;
  color: string | null;
  storage: string | null;
  ram: string | null;
  screenSize: string | null;
  processor: string | null;
  camera: string | null;
  os: string | null;
  networkType: string | null;
  battery: string | null;
};

/**
 * Cleans color/storage/RAM (see src/lib/variant-specs.ts) and, when the name is left blank,
 * derives it from those specs — so a variant can be defined by color/storage/RAM alone.
 */
export function normalizeVariantInput<T extends { variantName: string; color: string | null; storage: string | null; ram: string | null }>(input: T): T {
  const color = normalizeColor(input.color);
  const storage = normalizeStorage(input.storage);
  const ram = normalizeRam(input.ram);
  const variantName = input.variantName.trim() || buildVariantName({ storage, ram, color });
  return { ...input, color, storage, ram, variantName };
}

/**
 * Creates a variant, or revives a previously deleted one with the same name under the same
 * model. Deletes are soft (deletedAt) so sold units keep their history, which means the
 * (phoneModelId, variantName) unique key would otherwise block re-creating that name.
 */
export async function createOrRestorePhoneVariant(raw: VariantSpecInput) {
  const input = normalizeVariantInput(raw);
  const existing = await prisma.phoneVariant.findUnique({
    where: { phoneModelId_variantName: { phoneModelId: input.phoneModelId, variantName: input.variantName } },
  });
  if (!existing) return prisma.phoneVariant.create({ data: input });
  if (!existing.deletedAt) return existing;
  return prisma.phoneVariant.update({ where: { id: existing.id }, data: { ...input, deletedAt: null } });
}

/**
 * Soft-deletes a variant. Refused while it still has live units (anything not sold or
 * written off), so stock can never silently disappear from the catalog.
 */
export async function deletePhoneVariant(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "Missing variant." };
  const activeUnits = await prisma.phone.count({
    where: { phoneVariantId: id, deletedAt: null, status: { notIn: ["Sold", "WrittenOff"] } },
  });
  if (activeUnits > 0) {
    return {
      ok: false,
      error: `This variant still has ${activeUnits} active unit${activeUnits === 1 ? "" : "s"} (in stock, reserved, returned or in repair). Sell, write off or archive them first.`,
    };
  }

  await prisma.phoneVariant.update({ where: { id }, data: { deletedAt: new Date() } });

  revalidatePath("/items/phones");
  revalidatePath("/items/phone-catalog");
  revalidatePath("/dashboard");
  revalidatePath("/lots");
  revalidatePath("/quotations");
  return { ok: true };
}

/**
 * Soft-deletes a phone model together with its variants (same timestamp, so restoring the
 * model from the Recycle Bin brings them back too). Refused while any of its variants still
 * has live units, so stock never silently disappears.
 */
export async function softDeletePhoneModel(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const model = await prisma.phoneModel.findUnique({ where: { id }, select: { deletedAt: true, brand: true, modelName: true } });
  if (!model || model.deletedAt) return { ok: false, error: "Model not found." };
  const activeUnits = await prisma.phone.count({
    where: { deletedAt: null, status: { notIn: ["Sold", "WrittenOff"] }, phoneVariant: { phoneModelId: id } },
  });
  if (activeUnits > 0) {
    return {
      ok: false,
      error: `${model.brand} ${model.modelName} still has ${activeUnits} active unit${activeUnits === 1 ? "" : "s"} (in stock, reserved, returned or in repair). Sell, write off, archive them, or move their variants to another model first.`,
    };
  }
  const now = new Date();
  await prisma.$transaction([
    prisma.phoneVariant.updateMany({ where: { phoneModelId: id, deletedAt: null }, data: { deletedAt: now } }),
    prisma.phoneModel.update({ where: { id }, data: { deletedAt: now } }),
  ]);
  for (const path of ["/items/phones", "/items/phone-catalog", "/dashboard", "/lots", "/quotations", "/recycle-bin"]) revalidatePath(path);
  return { ok: true };
}

/**
 * Checks that a variant can live under `targetModelId` with `variantName` — the pair must be
 * unique (deleted variants included, since they still hold the name until purged).
 */
export async function checkVariantPlacement(variantId: string, targetModelId: string, variantName: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const target = await prisma.phoneModel.findUnique({ where: { id: targetModelId }, select: { deletedAt: true, brand: true, modelName: true } });
  if (!target || target.deletedAt) return { ok: false, error: "That model doesn't exist or is deleted." };
  const clash = await prisma.phoneVariant.findFirst({
    where: { phoneModelId: targetModelId, variantName, id: { not: variantId } },
    select: { deletedAt: true },
  });
  if (clash) {
    return {
      ok: false,
      error: `${target.brand} ${target.modelName} already has a variant named "${variantName}"${clash.deletedAt ? " (in the Recycle Bin)" : ""}. Rename this variant first${clash.deletedAt ? ", or restore and use that one" : ""}.`,
    };
  }
  return { ok: true };
}
