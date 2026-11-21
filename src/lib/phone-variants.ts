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
