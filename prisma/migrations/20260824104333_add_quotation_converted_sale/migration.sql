-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "convertedSaleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_convertedSaleId_key" ON "Quotation"("convertedSaleId");

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_convertedSaleId_fkey" FOREIGN KEY ("convertedSaleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

