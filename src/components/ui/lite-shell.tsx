"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Home, LayoutGrid, Package, ShoppingCart, X } from "lucide-react";
import { navItems } from "@/lib/navigation";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ModeSwitch } from "@/components/ui/mode-switch";
import { LogoutButton } from "@/components/ui/logout-button";

const TABS = [
  { href: "/lite", label: "Home", icon: Home, match: (path: string) => path === "/lite" },
  { href: "/lite/stock", label: "Stock", icon: Package, match: (path: string) => path.startsWith("/lite/stock") || path.startsWith("/items") },
  { href: "/sales", label: "Sell", icon: ShoppingCart, match: (path: string) => path.startsWith("/sales") },
  { href: "/quotations", label: "Quotes", icon: FileText, match: (path: string) => path.startsWith("/quotations") },
];

/**
 * Lite version chrome: slim top bar and a bottom tab bar sized for thumbs. "More" opens every
 * other page plus theme, Full-version switch and log out.
 */
export function LiteShell({ name, role, children }: { name?: string | null; role?: string; children: ReactNode }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => setMoreOpen(false), [pathname]);
  useEffect(() => {
    if (!moreOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setMoreOpen(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  const links = navItems.flatMap((item) => (item.children ? item.children : [item]));

  return (
    <div className="min-h-screen pb-[calc(4.5rem+env(safe-area-inset-bottom))] print:pb-0">
      <header className="glass-panel sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-white/90 px-4 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] print:hidden">
        <Link href="/lite" className="text-base font-semibold tracking-tight text-slate-950">
          IStockPro <span className="ml-1 rounded-md bg-sky-100 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-sky-800">Lite</span>
        </Link>
        <div className="w-28">
          <ThemeToggle compact />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-4 print:max-w-none print:p-0">{children}</main>

      <nav className="glass-panel fixed inset-x-0 bottom-0 z-40 border-t border-white/90 pb-[env(safe-area-inset-bottom)] print:hidden" aria-label="Lite navigation">
        <div className="mx-auto grid max-w-3xl grid-cols-5">
          {TABS.map((tab) => {
            const active = tab.match(pathname);
            return (
              <Link key={tab.href} href={tab.href} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition ${active ? "text-slate-950" : "text-slate-500"}`}>
                <span className={`flex h-7 w-12 items-center justify-center rounded-full transition ${active ? "bg-slate-900 text-white" : ""}`}>
                  <tab.icon className="size-5" />
                </span>
                {tab.label}
              </Link>
            );
          })}
          <button type="button" onClick={() => setMoreOpen(true)} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${moreOpen ? "text-slate-950" : "text-slate-500"}`}>
            <span className="flex h-7 w-12 items-center justify-center rounded-full">
              <LayoutGrid className="size-5" />
            </span>
            More
          </button>
        </div>
      </nav>

      {moreOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/50" onClick={() => setMoreOpen(false)} role="dialog" aria-modal="true" aria-label="More">
          <div className="modal-panel-in modal-panel-size w-full overflow-y-auto rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-semibold text-slate-900">All pages</p>
              <button type="button" onClick={() => setMoreOpen(false)} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X className="size-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {links.map((link) => (
                <Link key={link.href + link.label} href={link.href} className={`rounded-xl border px-3 py-3 text-sm font-medium ${pathname === link.href || pathname.startsWith(`${link.href}/`) ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-800"}`}>
                  {link.label}
                </Link>
              ))}
            </div>
            <div className="mt-4 grid gap-3">
              <ModeSwitch mode="lite" className="btn btn-md btn-secondary w-full" />
              <LogoutButton name={name} role={role} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
