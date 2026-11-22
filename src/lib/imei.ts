import { prisma } from "@/lib/prisma";
import { formatPhoneName } from "@/lib/format-item-name";
import type { ImeiOwner } from "@/components/items/imei-conflict-notice";

const ownerSelect = {
  id: true,
  imei: true,
  status: true,
  lot: { select: { id: true, lotNumber: true } },
  phoneVariant: { include: { phoneModel: true } },
} as const;

/** The live (non-deleted) unit holding this IMEI, ignoring `exceptPhoneId`. */
export async function findImeiOwner(imei: string, exceptPhoneId?: string): Promise<ImeiOwner | null> {
  const trimmed = imei.trim();
  if (!trimmed) return null;
  const phone = await prisma.phone.findFirst({
    where: { imei: { equals: trimmed, mode: "insensitive" }, deletedAt: null, ...(exceptPhoneId ? { id: { not: exceptPhoneId } } : {}) },
    select: ownerSelect,
  });
  return phone ? { imei: phone.imei, phone: formatPhoneName(phone.phoneVariant), lotId: phone.lot.id, lotNumber: phone.lot.lotNumber, status: phone.status } : null;
}

/** Every live IMEI → its unit, keyed lower-case — for instant client-side duplicate checks. */
export async function liveImeiOwners(): Promise<Record<string, ImeiOwner>> {
  const phones = await prisma.phone.findMany({ where: { deletedAt: null }, select: ownerSelect });
  return Object.fromEntries(
    phones.map((phone) => [phone.imei.trim().toLowerCase(), { imei: phone.imei, phone: formatPhoneName(phone.phoneVariant), lotId: phone.lot.id, lotNumber: phone.lot.lotNumber, status: phone.status }])
  );
}
