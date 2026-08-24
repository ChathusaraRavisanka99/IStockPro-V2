-- CreateTable
CREATE TABLE "LotPayment" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "method" "PaymentMethod",
    "reference" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LotPayment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LotPayment" ADD CONSTRAINT "LotPayment_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

