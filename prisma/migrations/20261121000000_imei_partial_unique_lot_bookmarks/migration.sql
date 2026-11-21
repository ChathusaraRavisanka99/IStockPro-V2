-- IMEI uniqueness only applies to live (non-deleted) phones, so a soft-deleted unit's
-- IMEI can be registered again. Prisma can't express a partial unique index, so it's
-- raw SQL here; the schema only declares a plain index on imei.
DROP INDEX IF EXISTS "Phone_imei_key";
CREATE UNIQUE INDEX "Phone_imei_active_key" ON "Phone"("imei") WHERE "deletedAt" IS NULL;
CREATE INDEX "Phone_imei_idx" ON "Phone"("imei");

-- Per-user lot bookmarks.
CREATE TABLE "LotBookmark" (
    "userId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LotBookmark_pkey" PRIMARY KEY ("userId","lotId")
);
CREATE INDEX "LotBookmark_lotId_idx" ON "LotBookmark"("lotId");
ALTER TABLE "LotBookmark" ADD CONSTRAINT "LotBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LotBookmark" ADD CONSTRAINT "LotBookmark_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same deny-all-to-PostgREST posture as every other public table
-- (see 20260904120000_enable_rls_public_tables).
ALTER TABLE public."LotBookmark" ENABLE ROW LEVEL SECURITY;
