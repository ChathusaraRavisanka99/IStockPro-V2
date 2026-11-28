-- Soft delete for customer and supplier (lot) payments: deleted payments go to the Recycle Bin.
ALTER TABLE "Payment" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "LotPayment" ADD COLUMN "deletedAt" TIMESTAMP(3);
