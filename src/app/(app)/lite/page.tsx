import Link from "next/link";
import { getServerSession } from "next-auth";
import { AlertTriangle, BarChart3, FileText, LayoutDashboard, Package, PackagePlus, Receipt, RotateCcw, ShoppingCart, Star, Truck, Users, Wallet } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/currency";

/** Lite home: today's numbers, big shortcuts for daily jobs, and the latest sales. */
export default async function LiteHomePage() {
  const session = await getServerSession(authOptions);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [today, inStock, models, accessories, recentSales, bookmarks, openInvoices] = await Promise.all([
    prisma.sale.aggregate({ _sum: { totalAmount: true }, _count: true, where: { status: "Completed", saleDate: { gte: startOfDay } } }),
    prisma.phone.count({ where: { deletedAt: null, status: "InStock" } }),
    prisma.phoneModel.findMany({ where: { deletedAt: null }, select: { lowStockThreshold: true, variants: { where: { deletedAt: null }, select: { _count: { select: { phones: { where: { deletedAt: null, status: "InStock" } } } } } } } }),
    prisma.accessory.findMany({ where: { deletedAt: null }, select: { quantity: true, lowStockThreshold: true } }),
    prisma.sale.findMany({ where: { status: "Completed" }, orderBy: { saleDate: "desc" }, take: 5, select: { id: true, saleNumber: true, saleDate: true, totalAmount: true, customer: { select: { name: true } }, _count: { select: { items: true } } } }),
    prisma.lotBookmark.findMany({ where: { userId: session?.user?.id ?? "", lot: { deletedAt: null } }, include: { lot: { select: { id: true, lotNumber: true, status: true } } }, take: 6 }),
    prisma.invoice.findMany({
      where: { status: { in: ["Unpaid", "PartiallyPaid"] }, sale: { status: { not: "Voided" } } },
      select: { totalAmount: true, paidAmount: true, sale: { select: { id: true, saleNumber: true, saleDate: true, customer: { select: { name: true } } } } },
    }),
  ]);
  const unpaid = openInvoices
    .map((invoice) => ({ ...invoice.sale, due: Math.max(0, Number(invoice.totalAmount) - Number(invoice.paidAmount)) }))
    .filter((row) => row.due > 0.004)
    .sort((a, b) => a.saleDate.getTime() - b.saleDate.getTime());
  const owed = unpaid.reduce((sum, row) => sum + row.due, 0);
  const lowStock =
    models.filter((model) => model.variants.reduce((sum, variant) => sum + variant._count.phones, 0) <= model.lowStockThreshold).length +
    accessories.filter((item) => item.quantity <= item.lowStockThreshold).length;

  const firstName = (session?.user?.name || session?.user?.username || "").split(" ")[0];
  const tiles = [
    { href: "/sales", label: "New sale", hint: "Bill phones & accessories", icon: ShoppingCart, primary: true },
    { href: "/lite/stock", label: "Check stock", hint: "Search model, color, IMEI", icon: Package },
    { href: "/quotations", label: "Quotation", hint: "Price a customer quote", icon: FileText },
    { href: "/lots", label: "Receive phones", hint: "Add units to a lot", icon: PackagePlus },
    { href: "/customers", label: "Customers", hint: "Contacts & history", icon: Users },
    { href: "/returns", label: "Returns", hint: "Take an item back", icon: RotateCcw },
    { href: "/suppliers", label: "Suppliers", hint: "Lots, owed & stats", icon: Truck },
    { href: "/expenses", label: "Expenses", hint: "Record & see stats", icon: Receipt },
    { href: "/dashboard", label: "Full dashboard", hint: "Charts, lots, owed", icon: LayoutDashboard },
    { href: "/reports", label: "Reports", hint: "Profit & breakdowns", icon: BarChart3 },
  ];

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-950">Hi{firstName ? `, ${firstName}` : ""} 👋</h1>
        <p className="text-sm text-slate-500">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</p>
      </div>

      <section className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
          <p className="text-[11px] text-slate-500">Sales today</p>
          <p className="break-words text-base font-semibold text-slate-900">{formatMoney(today._sum.totalAmount ?? 0)}</p>
          <p className="text-[11px] text-slate-500">{today._count} sale{today._count === 1 ? "" : "s"}</p>
        </div>
        <Link href="/dashboard#unpaid" className={`rounded-2xl border px-3 py-3 ${owed > 0 ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
          <p className="flex items-center gap-1 text-[11px] text-slate-500"><Wallet className="size-3" /> Owed to you</p>
          <p className="break-words text-base font-semibold text-slate-900">{formatMoney(owed)}</p>
          <p className="text-[11px] text-slate-500">{unpaid.length} unpaid sale{unpaid.length === 1 ? "" : "s"}</p>
        </Link>
        <Link href="/lite/stock" className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
          <p className="text-[11px] text-slate-500">Phones in stock</p>
          <p className="text-base font-semibold text-slate-900">{inStock}</p>
          <p className="text-[11px] text-slate-500">tap to check</p>
        </Link>
        <Link href="/dashboard#low-stock" className={`rounded-2xl border px-3 py-3 ${lowStock ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
          <p className="flex items-center gap-1 text-[11px] text-slate-500">{lowStock ? <AlertTriangle className="size-3 text-amber-600" /> : null} Low stock</p>
          <p className="text-base font-semibold text-slate-900">{lowStock}</p>
          <p className="text-[11px] text-slate-500">{lowStock ? "to reorder" : "all good"}</p>
        </Link>
      </section>

      <section className="grid grid-cols-2 gap-2">
        {tiles.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className={`flex min-h-[92px] flex-col justify-between rounded-2xl border p-3 transition active:scale-[0.98] ${tile.primary ? "col-span-2 border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-900"}`}
          >
            <tile.icon className={`size-6 ${tile.primary ? "" : "text-slate-500"}`} />
            <span>
              <span className="block text-base font-semibold">{tile.label}</span>
              <span className={`block text-xs ${tile.primary ? "opacity-80" : "text-slate-500"}`}>{tile.hint}</span>
            </span>
          </Link>
        ))}
      </section>

      {unpaid.length ? (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Unpaid sales (oldest first)</p>
            <Link href="/dashboard#unpaid" className="text-xs font-medium text-slate-600 underline">
              All
            </Link>
          </div>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {unpaid.slice(0, 4).map((sale) => {
              const days = Math.max(0, Math.floor((Date.now() - sale.saleDate.getTime()) / 86_400_000));
              return (
                <li key={sale.id}>
                  <Link href={`/sales/${sale.id}`} className="flex items-center justify-between gap-3 px-3 py-3 active:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-900">{sale.customer?.name ?? "Walk-in"}</span>
                      <span className="text-xs text-slate-500">{sale.saleNumber} · {days}d ago</span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-red-700">{formatMoney(sale.due)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {bookmarks.length ? (
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Bookmarked lots</p>
          <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
            {bookmarks.map((bookmark) => (
              <Link key={bookmark.lot.id} href={`/lots/${bookmark.lot.id}`} className="flex shrink-0 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-slate-800">
                <Star className="size-3.5 fill-amber-400 text-amber-500" /> {bookmark.lot.lotNumber}
                <span className="text-xs text-slate-500">{bookmark.lot.status}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Latest sales</p>
          <Link href="/sales" className="text-xs font-medium text-slate-600 underline">
            All sales
          </Link>
        </div>
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {recentSales.map((sale) => (
            <li key={sale.id}>
              <Link href={`/sales/${sale.id}`} className="flex items-center justify-between gap-3 px-3 py-3 active:bg-slate-50">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-900">{sale.customer?.name ?? "Walk-in"}</span>
                  <span className="text-xs text-slate-500">
                    {sale._count.items} item{sale._count.items === 1 ? "" : "s"} · {sale.saleDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-slate-900">{formatMoney(sale.totalAmount)}</span>
              </Link>
            </li>
          ))}
          {!recentSales.length ? <li className="px-3 py-4 text-sm text-slate-500">No sales yet.</li> : null}
        </ul>
      </section>
    </div>
  );
}
