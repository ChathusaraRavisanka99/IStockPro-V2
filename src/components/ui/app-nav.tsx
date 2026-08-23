"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { navItems } from "@/lib/navigation";

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="grid gap-1">
      {navItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "rounded-lg px-3 py-2 text-sm transition",
              active
                ? "bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900"
                : "text-slate-700 hover:bg-slate-200/70 dark:text-slate-200 dark:hover:bg-slate-700/50",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
