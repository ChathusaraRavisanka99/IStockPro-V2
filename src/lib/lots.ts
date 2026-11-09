import { prisma } from "@/lib/prisma";

/**
 * Soft-deletes a lot together with its (unsold) units. Refused once any unit from the lot
 * has been sold — that sale history must keep pointing at a live lot. The lot number is
 * freed up so it can be reused; the record itself is purged after the retention window
 * (see src/lib/purge.ts).
 */
export async function softDeleteLot(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const lot = await prisma.lot.findUnique({ where: { id }, select: { id: true, lotNumber: true, deletedAt: true } });
  if (!lot || lot.deletedAt) return { ok: false, error: "Lot not found." };

  const soldLines = await prisma.saleItem.count({ where: { phone: { lotId: id } } });
  if (soldLines > 0) {
    return { ok: false, error: "Units from this lot have already been sold, so it can't be deleted. Archive individual unsold units instead." };
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.phone.updateMany({ where: { lotId: id, deletedAt: null }, data: { deletedAt: now } }),
    prisma.lot.update({ where: { id }, data: { deletedAt: now, lotNumber: `${lot.lotNumber} [deleted ${now.getTime()}]` } }),
  ]);
  return { ok: true };
}
