-- CreateEnum
CREATE TYPE "SaleType" AS ENUM ('Retail', 'Wholesale');

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "saleType" "SaleType" NOT NULL DEFAULT 'Retail';
