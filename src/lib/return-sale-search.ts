"use server";

import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatSaleItemName } from "@/lib/format-item-name";

export type ReturnableSale = {
  id: string;
  saleNumber: string;
  date: string;
  customer: string | null;
  customerPhone: string | null;
  saleType: string;
  status: string;
  total: number;
  items: { id: string; label: string; quantity: number; sold: number; unitPrice: number }[];
};

export type SaleSearchFilters = {
  query?: string;
  from?: string;
  to?: string;
  saleType?: string;
  onlyReturnable?: boolean;
};

/**
 * Sales for the Returns "pick a sale" popup. `query` matches the sale number, customer name or
 * phone, an IMEI, or a model/accessory name. Newest first, at most 60 results.
 */
export async function searchReturnableSales(filters: SaleSearchFilters): Promise<{ sales: ReturnableSale[]; more: boolean }> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return { sales: [], more: false };

  const query = filters.query?.trim() ?? "";
  const where: Prisma.SaleWhereInput = { AND: [] };
  const and = where.AND as Prisma.SaleWhereInput[];
  if (query) {
    and.push({
      OR: [
        { saleNumber: { contains: query, mode: "insensitive" } },
        { customer: { name: { contains: query, mode: "insensitive" } } },
        { customer: { phone: { contains: query } } },
        { items: { some: { phone: { imei: { contains: query } } } } },
        { items: { some: { phone: { phoneVariant: { phoneModel: { modelName: { contains: query, mode: "insensitive" } } } } } } },
        { items: { some: { accessory: { name: { contains: query, mode: "insensitive" } } } } },
      ],
    });
  }
  const from = filters.from ? new Date(`${filters.from}T00:00:00`) : null;
  const to = filters.to ? new Date(`${filters.to}T23:59:59.999`) : null;
  if (from && !Number.isNaN(from.getTime())) and.push({ saleDate: { gte: from } });
  if (to && !Number.isNaN(to.getTime())) and.push({ saleDate: { lte: to } });
  if (filters.saleType === "Retail" || filters.saleType === "Wholesale") and.push({ saleType: filters.saleType });

  const LIMIT = 60;
  const rows = await prisma.sale.findMany({
    where,
    orderBy: { saleDate: "desc" },
    take: filters.onlyReturnable ? 200 : LIMIT + 1,
    include: {
      customer: { select: { name: true, phone: true } },
      items: {
        include: {
          phone: { include: { phoneVariant: { include: { phoneModel: true } } } },
          accessory: true,
          returnItems: { select: { quantity: true } },
        },
      },
    },
  });

  let sales: ReturnableSale[] = rows.map((sale) => ({
    id: sale.id,
    saleNumber: sale.saleNumber,
    date: sale.saleDate.toISOString().slice(0, 10),
    customer: sale.customer?.name ?? null,
    customerPhone: sale.customer?.phone ?? null,
    saleType: sale.saleType,
    status: sale.status,
    total: Number(sale.totalAmount),
    items: sale.items
      .map((item) => ({
        id: item.id,
        label: formatSaleItemName(item),
        sold: item.quantity,
        quantity: item.quantity - item.returnItems.reduce((sum, returned) => sum + returned.quantity, 0),
        unitPrice: Number(item.unitPrice),
      }))
      .filter((item) => item.quantity > 0),
  }));
  if (filters.onlyReturnable) sales = sales.filter((sale) => sale.items.length > 0);
  return { sales: sales.slice(0, LIMIT), more: sales.length > LIMIT };
}
