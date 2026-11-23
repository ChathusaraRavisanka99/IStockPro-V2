import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    // The database is remote, so pooler latency adds up per query. The default 5 s limit on
    // interactive transactions made multi-line saves (10+ phone bills, lot batches) fail
    // mid-way; give them room while still bounding a stuck transaction.
    transactionOptions: { maxWait: 10_000, timeout: 30_000 },
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
