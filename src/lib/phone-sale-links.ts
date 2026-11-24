"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type PhoneSaleLink = {
  saleId: string;
  saleNumber: string;
  date: string;
  status: string;
  customerId: string | null;
  customer: string | null;
  price: number;
  returns: string[];
};

/** The sale(s) a phone was sold in (newest first), with any returns — for the cost popup. */
export async function phoneSaleLinks(phoneId: string): Promise<PhoneSaleLink[]> {
  const session = await getServerSession(authOptions);
  if (!session?.user || !phoneId) return [];
  const lines = await prisma.saleItem.findMany({
    where: { phoneId },
    orderBy: { sale: { saleDate: "desc" } },
    select: {
      unitPrice: true,
      returnItems: { select: { return: { select: { returnNumber: true } } } },
      sale: { select: { id: true, saleNumber: true, saleDate: true, status: true, customerId: true, customer: { select: { name: true } } } },
    },
  });
  return lines.map((line) => ({
    saleId: line.sale.id,
    saleNumber: line.sale.saleNumber,
    date: line.sale.saleDate.toISOString().slice(0, 10),
    status: line.sale.status,
    customerId: line.sale.customerId,
    customer: line.sale.customer?.name ?? null,
    price: Number(line.unitPrice),
    returns: line.returnItems.map((item) => item.return.returnNumber),
  }));
}
