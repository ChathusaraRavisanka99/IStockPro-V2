-- CreateEnum
CREATE TYPE "TaxType" AS ENUM ('Percent', 'Amount');

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "customerEmail" TEXT,
ADD COLUMN     "customerPhone" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "taxAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "taxType" "TaxType" NOT NULL DEFAULT 'Percent';

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "handlingFee" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "taxPercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "taxType" "TaxType" NOT NULL DEFAULT 'Amount';

