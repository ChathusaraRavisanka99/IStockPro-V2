-- CreateTable
CREATE TABLE "LotAccessoryItem" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "accessoryId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LotAccessoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LotAccessoryItem_lotId_idx" ON "LotAccessoryItem"("lotId");

-- CreateIndex
CREATE INDEX "LotAccessoryItem_accessoryId_idx" ON "LotAccessoryItem"("accessoryId");

-- AddForeignKey
ALTER TABLE "LotAccessoryItem" ADD CONSTRAINT "LotAccessoryItem_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotAccessoryItem" ADD CONSTRAINT "LotAccessoryItem_accessoryId_fkey" FOREIGN KEY ("accessoryId") REFERENCES "Accessory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enable RLS to match every other table (see 20260904120000_enable_rls_public_tables).
ALTER TABLE "LotAccessoryItem" ENABLE ROW LEVEL SECURITY;
