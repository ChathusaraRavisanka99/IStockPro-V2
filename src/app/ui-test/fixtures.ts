import type { ReportExtras } from "@/lib/report-extras";
import type { CartItemOption } from "@/components/ui/cart-builder";

/** Deliberately long, realistic values — the things that overflow phones in real data. */
export const LONG_PHONE = "Apple iPhone 13 Pro Max - 256GB · 6GB RAM · Sierra Blue Graphite Edition";
export const LONG_NAME = "NADEESHA GUNAHHTILAKA CHATHURANGA GUNATHILAKA";
export const LONG_IMEI = "359628542928359628";

export const topSellers = Array.from({ length: 6 }, (_, index) => ({ label: `${LONG_PHONE} #${index + 1}`, revenue: 385500 - index * 40000, qty: 4 - (index % 3) }));

export const tableRows = Array.from({ length: 4 }, (_, index) => ({
  id: `row-${index}`,
  date: "2026-11-24 04:08",
  phone: LONG_PHONE,
  imei: `${LONG_IMEI.slice(0, 15)}${index}`,
  customer: LONG_NAME,
  price: 1234567.89 + index,
}));

const row = (key: string, label: string, revenue: number): ReportExtras["byModel"][number] => ({ key, label, id: undefined, revenue, cost: revenue * 0.8, sales: 3, units: 4, profit: revenue * 0.2, margin: 20 });
export const reportExtras: ReportExtras = {
  comparison: {
    previousFrom: new Date("2026-10-01"),
    previousTo: new Date("2026-10-31"),
    revenue: { now: 1297267.52, before: 1100000, change: 17.9 },
    sales: { now: 12, before: 10, change: 20 },
    unitsSold: { now: 14, before: 12, change: 16.7 },
    gross: { now: 250000, before: 200000, change: 25 },
    net: { now: 150000, before: 160000, change: -6.3 },
  },
  byModel: [row("m1", LONG_PHONE, 900000), row("m2", "Apple iPhone 14", 300000)],
  byBrand: [row("b1", "Apple", 1200000), row("b2", "Accessories · Charger", 97000)],
  byCustomer: [row("c1", LONG_NAME, 700000), row("walk-in", "Walk-in customers", 500000)],
  byStaff: [row("s1", "Seed Manager", 800000)],
  byType: [row("t1", "Retail", 900000), row("t2", "Wholesale", 397000)],
  payments: [
    { method: "BankTransfer", amount: 800000, count: 4 },
    { method: "Cash", amount: 300000, count: 8 },
  ],
  expensesByCategory: [{ category: "Repairs and battery replacement for returned units", amount: 45000, count: 3 }],
};

/** Sample stock: long phone names with IMEIs plus accessories (what the sale/quote pickers list). */
export const sampleItems: CartItemOption[] = [
  ...Array.from({ length: 12 }, (_, index) => ({
    value: `phone:${index}`,
    label: `${LONG_PHONE} - IMEI ${LONG_IMEI.slice(0, 14)}${index}`,
    price: 385500 + index * 1000,
    wholesalePrice: 350000,
    category: "Phones",
    notes: index === 0 ? "Small scratch on the back — mention to the customer" : null,
  })),
  { value: "acc:1", label: "USB-C fast charger 25W (SKU JK05-1224947)", price: 4500, wholesalePrice: 3500, maxQuantity: 31, category: "Chargers" },
];

