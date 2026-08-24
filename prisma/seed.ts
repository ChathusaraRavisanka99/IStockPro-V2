import bcrypt from "bcryptjs";
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 10);

  await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      name: "Seed Admin",
      role: UserRole.admin,
      passwordHash,
      email: "admin@istockpro.local",
    },
  });

  const model = await prisma.phoneModel.upsert({
    where: {
      brand_modelName: {
        brand: "Apple",
        modelName: "iPhone 14",
      },
    },
    update: {},
    create: {
      brand: "Apple",
      modelName: "iPhone 14",
      warrantyMonths: 6,
      lowStockThreshold: 2,
    },
  });

  await prisma.phoneVariant.upsert({
    where: {
      phoneModelId_variantName: {
        phoneModelId: model.id,
        variantName: "128GB Midnight",
      },
    },
    update: {},
    create: {
      phoneModelId: model.id,
      variantName: "128GB Midnight",
      storage: "128GB",
      color: "Midnight",
    },
  });

  await prisma.accessory.upsert({
    where: { sku: "CHG-20W-APPLE" },
    update: {},
    create: {
      name: "Apple 20W Charger",
      category: "Charger",
      sku: "CHG-20W-APPLE",
      quantity: 20,
      purchasePrice: 12,
      wholesalePrice: 16,
      retailPrice: 20,
      lowStockThreshold: 5,
    },
  });

  console.log("Seed complete: admin/admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
