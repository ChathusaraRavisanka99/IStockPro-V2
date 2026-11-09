import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** How long a soft-deleted record is kept before it's permanently removed. */
export const SOFT_DELETE_RETENTION_DAYS = 30;
const RUN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const BATCH_LIMIT = 500;

type PurgeCounts = Record<string, { deleted: number; kept: number }>;

function isForeignKeyViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2003" || error.code === "P2014");
}

async function purgeRows(label: string, ids: string[], remove: (id: string) => Promise<unknown>, counts: PurgeCounts) {
  counts[label] = { deleted: 0, kept: 0 };
  for (const id of ids) {
    try {
      await remove(id);
      counts[label].deleted++;
    } catch (error) {
      // Still referenced by history we must keep (a sale line, a return, a quotation...):
      // it stays soft-deleted, invisible in the app, and is retried on the next run.
      if (isForeignKeyViolation(error)) counts[label].kept++;
      else throw error;
    }
  }
}

/**
 * Permanently deletes records that were soft-deleted more than SOFT_DELETE_RETENTION_DAYS
 * ago. Children go before parents so foreign keys resolve; anything still referenced by
 * sales/returns/quotation history is left soft-deleted rather than breaking that history.
 */
export async function purgeExpiredSoftDeletes(now = new Date()): Promise<PurgeCounts> {
  const cutoff = new Date(now.getTime() - SOFT_DELETE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const expired = { deletedAt: { not: null, lt: cutoff } };
  const ids = (rows: { id: string }[]) => rows.map((row) => row.id);
  const counts: PurgeCounts = {};

  await purgeRows("phones", ids(await prisma.phone.findMany({ where: expired, select: { id: true }, take: BATCH_LIMIT })), (id) => prisma.phone.delete({ where: { id } }), counts);

  // A lot cascades to its payments and accessory lines; only purge once it has no units left.
  await purgeRows("lots", ids(await prisma.lot.findMany({ where: { ...expired, phones: { none: {} } }, select: { id: true }, take: BATCH_LIMIT })), (id) => prisma.lot.delete({ where: { id } }), counts);

  await purgeRows("phoneVariants", ids(await prisma.phoneVariant.findMany({ where: { ...expired, phones: { none: {} } }, select: { id: true }, take: BATCH_LIMIT })), (id) => prisma.phoneVariant.delete({ where: { id } }), counts);

  // Deleting a model cascades to its variants, so wait until none remain at all.
  await purgeRows("phoneModels", ids(await prisma.phoneModel.findMany({ where: { ...expired, variants: { none: {} } }, select: { id: true }, take: BATCH_LIMIT })), (id) => prisma.phoneModel.delete({ where: { id } }), counts);

  await purgeRows("accessories", ids(await prisma.accessory.findMany({ where: expired, select: { id: true }, take: BATCH_LIMIT })), (id) => prisma.accessory.delete({ where: { id } }), counts);

  await purgeRows("customers", ids(await prisma.customer.findMany({ where: expired, select: { id: true }, take: BATCH_LIMIT })), (id) => prisma.customer.delete({ where: { id } }), counts);

  await purgeRows("suppliers", ids(await prisma.supplier.findMany({ where: expired, select: { id: true }, take: BATCH_LIMIT })), (id) => prisma.supplier.delete({ where: { id } }), counts);

  return counts;
}

const globalForPurge = globalThis as unknown as { lastSoftDeletePurge?: number; softDeletePurgeRunning?: boolean };

/**
 * Fire-and-forget trigger, called on authenticated page loads so the purge happens
 * automatically without a separate scheduler. Runs at most once every few hours per
 * server process and never blocks or fails the request. /api/cron/purge can also be hit
 * by an external cron for deployments that want a fixed schedule.
 */
export function schedulePurgeIfDue() {
  const now = Date.now();
  if (globalForPurge.softDeletePurgeRunning) return;
  if (globalForPurge.lastSoftDeletePurge && now - globalForPurge.lastSoftDeletePurge < RUN_INTERVAL_MS) return;
  globalForPurge.softDeletePurgeRunning = true;
  globalForPurge.lastSoftDeletePurge = now;
  purgeExpiredSoftDeletes()
    .catch((error) => console.error("[purge] soft-delete purge failed", error))
    .finally(() => {
      globalForPurge.softDeletePurgeRunning = false;
    });
}
