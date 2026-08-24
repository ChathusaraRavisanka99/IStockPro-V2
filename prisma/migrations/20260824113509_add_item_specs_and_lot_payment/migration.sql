-- CreateEnum
CREATE TYPE "PhoneGrade" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "LotPaymentStatus" AS ENUM ('Unpaid', 'Partial', 'Paid');

-- AlterTable
ALTER TABLE "Accessory" RENAME COLUMN "salePrice" TO "retailPrice";
ALTER TABLE "Accessory" ADD COLUMN     "connectorType" TEXT,
ADD COLUMN     "fastCharging" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "voltage" TEXT,
ADD COLUMN     "wholesalePrice" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Lot" ADD COLUMN     "amountPaid" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "paymentReference" TEXT,
ADD COLUMN     "paymentStatus" "LotPaymentStatus" NOT NULL DEFAULT 'Unpaid';

-- AlterTable
ALTER TABLE "Phone" ADD COLUMN     "batteryHealth" INTEGER,
ADD COLUMN     "grade" "PhoneGrade";

-- AlterTable
ALTER TABLE "PhoneVariant" ADD COLUMN     "battery" TEXT,
ADD COLUMN     "camera" TEXT,
ADD COLUMN     "networkType" TEXT,
ADD COLUMN     "os" TEXT,
ADD COLUMN     "processor" TEXT,
ADD COLUMN     "screenSize" TEXT;
