"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { AppNav } from "@/components/ui/app-nav";
import { LogoutButton } from "@/components/ui/logout-button";

type Props = {
  name?: string | null;
  role?: string;
};

export function MobileNav({ name, role }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <div className="glass-panel sticky top-0 z-30 mb-4 flex items-center justify-between rounded-2xl border border-white/90 p-3 lg:hidden">
        <Link href="/dashboard" className="rounded-xl px-2 py-1 text-lg font-semibold tracking-tight text-slate-950">
          IStockPro-v2
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="rounded-lg border border-slate-300 bg-white p-2 text-slate-800"
        >
          <Menu className="size-5" />
        </button>
      </div>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
              <div className="absolute inset-0 bg-slate-950/40" onClick={() => setOpen(false)} />
              <div className="glass-panel relative flex h-full w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto border-r border-white/90 p-4">
                <div className="flex items-center justify-between">
                  <Link href="/dashboard" className="rounded-xl px-2 py-1 text-lg font-semibold tracking-tight text-slate-950">
                    IStockPro-v2
                  </Link>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Close menu"
                    className="rounded-lg border border-slate-300 bg-white p-2 text-slate-800"
                  >
                    <X className="size-5" />
                  </button>
                </div>
                <AppNav />
                <div className="mt-auto">
                  <LogoutButton name={name} role={role} />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
