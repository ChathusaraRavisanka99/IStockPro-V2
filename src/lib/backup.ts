import { prisma } from "@/lib/prisma";

// Entities in dependency order — parents must be created before children that
// reference them by foreign key. User/AuditLog are intentionally excluded:
// User holds credentials (passwordHash) which must never leave the system via
// backup, and AuditLog is system-generated, not business data to restore.
const ENTITY_ORDER = [
  "phoneModel",
  "phoneVariant",
  "supplier",
  "customer",
  "lot",
  "lotPayment",
  "phone",
  "accessory",
  "sale",
  "saleItem",
  "invoice",
  "payment",
  "return",
  "returnItem",
  "returnInvoice",
  "quotation",
  "quotationItem",
  "expense",
  "taxPayment",
  "taxPaymentReceipt",
] as const;

export type EntityName = (typeof ENTITY_ORDER)[number];

export const BACKUP_VERSION = 1;

export type BackupFile = {
  version: number;
  exportedAt: string;
  data: Record<EntityName, Record<string, unknown>[]>;
};

// Decimal fields serialize as Decimal.js instances; JSON.stringify needs a
// replacer to turn them into plain strings (Prisma accepts numeric strings
// back on create, so no special parsing is needed on import).
function decimalSafeReplacer(_key: string, value: unknown) {
  if (value && typeof value === "object" && typeof (value as { toFixed?: unknown }).toFixed === "function") {
    return (value as { toString(): string }).toString();
  }
  return value;
}

export async function exportBackup(): Promise<string> {
  const data = {} as Record<EntityName, Record<string, unknown>[]>;
  for (const entity of ENTITY_ORDER) {
    // Every archived (soft-deleted) record is included as-is — a backup must
    // faithfully capture state, including archives, without resurrecting them.
    const delegate = (prisma as unknown as Record<string, { findMany: (args: unknown) => Promise<Record<string, unknown>[]> }>)[entity];
    data[entity] = await delegate.findMany({ orderBy: { createdAt: "asc" } }).catch(() =>
      delegate.findMany({}),
    );
  }
  const payload: BackupFile = { version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data };
  return JSON.stringify(payload, decimalSafeReplacer, 2);
}

// Extracts a "natural key" where clause for entities that have a real-world
// unique identifier distinct from their database id (IMEI, SKU, lot number,
// etc.) — used as a second duplicate check beyond id, so restoring into a
// database that already has the same business record (created independently,
// with a different id) still doesn't produce a duplicate.
function naturalKeyWhere(entity: EntityName, record: Record<string, unknown>): Record<string, unknown> | null {
  switch (entity) {
    case "phoneModel":
      return { brand_modelName: { brand: record.brand, modelName: record.modelName } };
    case "phoneVariant":
      return { phoneModelId_variantName: { phoneModelId: record.phoneModelId, variantName: record.variantName } };
    case "lot":
      return { lotNumber: record.lotNumber };
    case "phone":
      return { imei: record.imei };
    case "accessory":
      return { sku: record.sku };
    case "sale":
      return { saleNumber: record.saleNumber };
    case "invoice":
      return { invoiceNumber: record.invoiceNumber };
    case "return":
      return { returnNumber: record.returnNumber };
    case "returnInvoice":
      return { creditNoteNumber: record.creditNoteNumber };
    case "quotation":
      return { quoteNumber: record.quoteNumber };
    default:
      return null;
  }
}

export type ImportSummary = {
  entity: EntityName;
  created: number;
  skipped: number;
  errors: number;
}[];

export async function importBackup(fileText: string, currentUserId: string): Promise<{ summary: ImportSummary; invalid: boolean }> {
  let parsed: BackupFile;
  try {
    parsed = JSON.parse(fileText);
  } catch {
    return { summary: [], invalid: true };
  }
  if (!parsed || typeof parsed !== "object" || !parsed.data || typeof parsed.version !== "number") {
    return { summary: [], invalid: true };
  }

  const summary: ImportSummary = [];

  for (const entity of ENTITY_ORDER) {
    const records = parsed.data[entity];
    if (!Array.isArray(records) || !records.length) {
      summary.push({ entity, created: 0, skipped: 0, errors: 0 });
      continue;
    }

    const delegate = (prisma as unknown as Record<
      string,
      { findUnique: (args: unknown) => Promise<unknown>; findFirst: (args: unknown) => Promise<unknown>; create: (args: unknown) => Promise<unknown> }
    >)[entity];

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const rawRecord of records) {
      const record = { ...rawRecord };
      // Sale.createdById points at a User, which is never exported/imported —
      // re-link every restored sale to whichever admin is running the import.
      if (entity === "sale" && "createdById" in record) {
        record.createdById = currentUserId;
      }

      try {
        const existingById = record.id ? await delegate.findUnique({ where: { id: record.id } }) : null;
        if (existingById) {
          skipped++;
          continue;
        }
        const naturalWhere = naturalKeyWhere(entity, record);
        if (naturalWhere) {
          const existingByKey = await delegate.findFirst({ where: naturalWhere });
          if (existingByKey) {
            skipped++;
            continue;
          }
        }
        await delegate.create({ data: record });
        created++;
      } catch {
        errors++;
      }
    }

    summary.push({ entity, created, skipped, errors });
  }

  return { summary, invalid: false };
}
