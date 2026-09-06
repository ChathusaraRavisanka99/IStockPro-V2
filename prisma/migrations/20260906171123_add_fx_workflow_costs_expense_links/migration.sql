-- CreateEnum
CREATE TYPE "LotStatus" AS ENUM ('Shipped', 'Cleared');

-- AlterTable Lot: workflow status, lump-sum goods cost, other charges, FX audit trail
ALTER TABLE "Lot"
  ADD COLUMN "status" "LotStatus" NOT NULL DEFAULT 'Cleared',
  ADD COLUMN "goodsCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "otherCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "fxDetails" JSONB;

-- AlterTable LotPayment: payment slip upload
ALTER TABLE "LotPayment"
  ADD COLUMN "proofImageUrl" TEXT;

-- AlterTable Phone: tag/battery cost
ALTER TABLE "Phone"
  ADD COLUMN "tagCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "batteryCost" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- AlterTable PhoneVariant: default tag/battery cost
ALTER TABLE "PhoneVariant"
  ADD COLUMN "defaultTagCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "defaultBatteryCost" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- AlterTable Expense: optional link to a specific Phone or Accessory
ALTER TABLE "Expense"
  ADD COLUMN "phoneId" TEXT,
  ADD COLUMN "accessoryId" TEXT;

-- CreateIndex
CREATE INDEX "Expense_phoneId_idx" ON "Expense"("phoneId");
CREATE INDEX "Expense_accessoryId_idx" ON "Expense"("accessoryId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_phoneId_fkey" FOREIGN KEY ("phoneId") REFERENCES "Phone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_accessoryId_fkey" FOREIGN KEY ("accessoryId") REFERENCES "Accessory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
