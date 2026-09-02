import bcrypt from "bcryptjs";
import { PrismaClient, UserRole, PhoneGrade, LotPaymentStatus, PaymentMethod, TaxType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // ---- Users: one per role, so the role/permission system has something to demo ----
  const [admin] = await Promise.all([
    prisma.user.upsert({
      where: { username: "admin" },
      update: {},
      create: { username: "admin", name: "Seed Admin", role: UserRole.admin, passwordHash: await bcrypt.hash("admin123", 10), email: "admin@istockpro.local" },
    }),
    prisma.user.upsert({
      where: { username: "manager" },
      update: {},
      create: { username: "manager", name: "Seed Manager", role: UserRole.manager, passwordHash: await bcrypt.hash("manager123", 10), email: "manager@istockpro.local" },
    }),
    prisma.user.upsert({
      where: { username: "staff" },
      update: {},
      create: { username: "staff", name: "Seed Staff", role: UserRole.staff, passwordHash: await bcrypt.hash("staff123", 10), email: "staff@istockpro.local" },
    }),
  ]);

  // ---- Supplier + Lot (Lot carries customs/shipping/tax/payment fields) ----
  let supplier = await prisma.supplier.findFirst({ where: { name: "Global Mobile Imports" } });
  if (!supplier) {
    supplier = await prisma.supplier.create({
      data: { name: "Global Mobile Imports", phone: "+94 77 123 4567", email: "sales@globalmobileimports.example", address: "14 Duty Free Zone, Colombo" },
    });
  }

  const lot = await prisma.lot.upsert({
    where: { lotNumber: "LOT-0001" },
    update: {},
    create: {
      lotNumber: "LOT-0001",
      supplierId: supplier.id,
      purchaseDate: new Date(Date.now() - 30 * 86400000),
      shippingCost: 150,
      taxCost: 80,
      customsCost: 60,
      paymentMethod: PaymentMethod.BankTransfer,
      paymentReference: "TXN-INIT-0001",
      paymentStatus: LotPaymentStatus.Partial,
      amountPaid: 2000,
      note: "Initial seed lot for demo/testing.",
    },
  });

  // ---- Phone models + variants (varied specs so catalog filters have real data) ----
  const iphone14 = await prisma.phoneModel.upsert({
    where: { brand_modelName: { brand: "Apple", modelName: "iPhone 14" } },
    update: {},
    create: { brand: "Apple", modelName: "iPhone 14", warrantyMonths: 6, lowStockThreshold: 2 },
  });
  const iphoneVariant128 = await prisma.phoneVariant.upsert({
    where: { phoneModelId_variantName: { phoneModelId: iphone14.id, variantName: "128GB Midnight" } },
    update: {},
    create: {
      phoneModelId: iphone14.id,
      variantName: "128GB Midnight",
      color: "Midnight",
      storage: "128GB",
      ram: "6GB",
      screenSize: "6.1 inch",
      processor: "A15 Bionic",
      camera: "12MP Dual",
      os: "iOS 16",
      networkType: "5G",
      battery: "3279 mAh",
    },
  });
  const iphoneVariant256 = await prisma.phoneVariant.upsert({
    where: { phoneModelId_variantName: { phoneModelId: iphone14.id, variantName: "256GB Starlight" } },
    update: {},
    create: {
      phoneModelId: iphone14.id,
      variantName: "256GB Starlight",
      color: "Starlight",
      storage: "256GB",
      ram: "6GB",
      screenSize: "6.1 inch",
      processor: "A15 Bionic",
      camera: "12MP Dual",
      os: "iOS 16",
      networkType: "5G",
      battery: "3279 mAh",
    },
  });

  const galaxyS23 = await prisma.phoneModel.upsert({
    where: { brand_modelName: { brand: "Samsung", modelName: "Galaxy S23" } },
    update: {},
    create: { brand: "Samsung", modelName: "Galaxy S23", warrantyMonths: 12, lowStockThreshold: 2 },
  });
  const galaxyVariant = await prisma.phoneVariant.upsert({
    where: { phoneModelId_variantName: { phoneModelId: galaxyS23.id, variantName: "128GB Phantom Black" } },
    update: {},
    create: {
      phoneModelId: galaxyS23.id,
      variantName: "128GB Phantom Black",
      color: "Phantom Black",
      storage: "128GB",
      ram: "8GB",
      screenSize: "6.1 inch",
      processor: "Snapdragon 8 Gen 2",
      camera: "50MP Triple",
      os: "Android 13",
      networkType: "5G",
      battery: "3900 mAh",
    },
  });

  // ---- Individual phone units (grade, battery health, retail/wholesale pricing) ----
  const phoneSeeds = [
    { imei: "990000862471854", variantId: iphoneVariant128.id, purchasePrice: 620, wholesalePrice: 720, retailPrice: 799, grade: PhoneGrade.A, batteryHealth: 98, status: "InStock" as const },
    { imei: "990000862471861", variantId: iphoneVariant128.id, purchasePrice: 580, wholesalePrice: 680, retailPrice: 749, grade: PhoneGrade.B, batteryHealth: 87, status: "InStock" as const },
    { imei: "990000862471878", variantId: iphoneVariant256.id, purchasePrice: 700, wholesalePrice: 800, retailPrice: 899, grade: PhoneGrade.A, batteryHealth: 100, status: "InStock" as const },
    { imei: "990000862471885", variantId: galaxyVariant.id, purchasePrice: 540, wholesalePrice: 630, retailPrice: 699, grade: PhoneGrade.A, batteryHealth: 96, status: "InStock" as const },
  ];
  const phones = await Promise.all(
    phoneSeeds.map((p) =>
      prisma.phone.upsert({
        where: { imei: p.imei },
        update: {},
        create: {
          imei: p.imei,
          phoneVariantId: p.variantId,
          lotId: lot.id,
          purchasePrice: p.purchasePrice,
          wholesalePrice: p.wholesalePrice,
          retailPrice: p.retailPrice,
          grade: p.grade,
          batteryHealth: p.batteryHealth,
          status: p.status,
          notes: "Seed unit for demo/testing.",
        },
      }),
    ),
  );

  // ---- Accessories across every category, with category-appropriate specs ----
  await Promise.all([
    prisma.accessory.upsert({
      where: { sku: "CHG-20W-APPLE" },
      update: {},
      create: {
        name: "Apple 20W Charger", category: "Charger", sku: "CHG-20W-APPLE",
        quantity: 20, purchasePrice: 12, wholesalePrice: 16, retailPrice: 20, lowStockThreshold: 5,
        connectorType: "USB-C", fastCharging: true, voltage: "5V/9V/12V",
      },
    }),
    prisma.accessory.upsert({
      where: { sku: "CBL-TC-LTG-1M" },
      update: {},
      create: {
        name: "USB-C to Lightning Cable (1m)", category: "Cable", sku: "CBL-TC-LTG-1M",
        quantity: 35, purchasePrice: 4, wholesalePrice: 7, retailPrice: 10, lowStockThreshold: 10,
        connectorType: "Type-C to Lightning", fastCharging: true, voltage: "5V/9V",
      },
    }),
    prisma.accessory.upsert({
      where: { sku: "HF-WIRED-35MM" },
      update: {},
      create: {
        name: "Wired Earphones 3.5mm", category: "Handsfree", sku: "HF-WIRED-35MM",
        quantity: 15, purchasePrice: 3, wholesalePrice: 6, retailPrice: 9, lowStockThreshold: 5,
        connectorType: "3.5mm Jack",
      },
    }),
    prisma.accessory.upsert({
      where: { sku: "OTH-SCRN-PROT" },
      update: {},
      create: {
        name: "Tempered Glass Screen Protector", category: "Other", sku: "OTH-SCRN-PROT",
        quantity: 50, purchasePrice: 1, wholesalePrice: 2.5, retailPrice: 4, lowStockThreshold: 15,
      },
    }),
  ]);
  const chargerAccessory = await prisma.accessory.findUniqueOrThrow({ where: { sku: "CHG-20W-APPLE" } });

  // ---- Customer ----
  let customer = await prisma.customer.findFirst({ where: { name: "Nimal Perera" } });
  if (!customer) {
    customer = await prisma.customer.create({
      data: { name: "Nimal Perera", phone: "+94 71 234 5678", email: "nimal.perera@example.com", address: "22 Galle Road, Colombo" },
    });
  }

  // ---- A completed, paid sale (phone + accessory) so Reports/Dashboard have something to show ----
  const saleablePhone = phones[1]; // grade B unit stays available for a manual test sale
  const existingSale = await prisma.sale.findUnique({ where: { saleNumber: "SAL-SEED-0001" } });
  if (!existingSale) {
    const firstPhone = phones[0];
    const subtotal = Number(firstPhone.retailPrice) + Number(chargerAccessory.retailPrice);
    const taxPercent = 8;
    const taxAmount = Number((subtotal * (taxPercent / 100)).toFixed(2));
    const handlingFee = 5;
    const totalAmount = Number((subtotal + taxAmount + handlingFee).toFixed(2));

    const sale = await prisma.sale.create({
      data: {
        saleNumber: "SAL-SEED-0001",
        customerId: customer.id,
        subtotal,
        taxType: TaxType.Percent,
        taxPercent,
        taxAmount,
        handlingFee,
        totalAmount,
        status: "Completed",
        createdById: admin.id,
        items: {
          create: [
            { phoneId: firstPhone.id, quantity: 1, unitPrice: Number(firstPhone.retailPrice), lineTotal: Number(firstPhone.retailPrice) },
            { accessoryId: chargerAccessory.id, quantity: 1, unitPrice: Number(chargerAccessory.retailPrice), lineTotal: Number(chargerAccessory.retailPrice) },
          ],
        },
      },
    });

    await prisma.phone.update({ where: { id: firstPhone.id }, data: { status: "Sold" } });
    await prisma.accessory.update({ where: { id: chargerAccessory.id }, data: { quantity: { decrement: 1 }, soldQuantity: { increment: 1 } } });

    const invoice = await prisma.invoice.create({
      data: { invoiceNumber: "INV-SEED-0001", saleId: sale.id, status: "Paid", totalAmount, paidAmount: totalAmount },
    });
    await prisma.payment.create({
      data: { invoiceId: invoice.id, method: PaymentMethod.Card, amount: totalAmount, reference: "SEED-PAYMENT" },
    });
  }

  // ---- A draft quotation with the newer contact/tax/notes fields ----
  const existingQuote = await prisma.quotation.findUnique({ where: { quoteNumber: "QTN-SEED-0001" } });
  if (!existingQuote) {
    const subtotal = Number(saleablePhone.retailPrice);
    const taxAmount = 40;
    const handlingFee = 5;
    await prisma.quotation.create({
      data: {
        quoteNumber: "QTN-SEED-0001",
        customerId: customer.id,
        customerEmail: customer.email,
        customerPhone: customer.phone,
        validUntil: new Date(Date.now() + 7 * 86400000),
        taxType: TaxType.Amount,
        taxPercent: 0,
        taxAmount,
        handlingFee,
        subtotal,
        totalAmount: subtotal + taxAmount + handlingFee,
        status: "Draft",
        notes: "Seed quotation for demo/testing.",
        items: {
          create: [{ phoneVariantId: saleablePhone.phoneVariantId, description: "Phone variant", quantity: 1, unitPrice: subtotal, lineTotal: subtotal }],
        },
      },
    });
  }

  console.log("Seed complete.");
  console.log("  admin   / admin123   (role: admin)");
  console.log("  manager / manager123 (role: manager)");
  console.log("  staff   / staff123   (role: staff)");
  console.log("Change these before any real deployment.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
