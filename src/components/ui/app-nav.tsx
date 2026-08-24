"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { ChevronDown } from "lucide-react";
import { navItems } from "@/lib/navigation";

export function AppNav() {
  const pathname = usePathname();
  const [itemsOpen, setItemsOpen] = useState(pathname.startsWith("/items"));

  useEffect(() => {
    if (pathname.startsWith("/items")) {
      setItemsOpen(true);
    }
  }, [pathname]);

  return (
    <nav className="grid gap-1.5">
      {navItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        if (item.children?.length) {
          const childActive = item.children.some((child) => pathname === child.href || pathname.startsWith(`${child.href}/`));

          return (
            <div key={item.label} className="grid gap-1">
              <button
                type="button"
                onClick={() => setItemsOpen((prev) => !prev)}
                className={clsx(
                  "flex items-center justify-between rounded-xl px-3 py-2 text-sm transition",
                  childActive
                    ? "bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900"
                    : "font-medium text-slate-900 hover:bg-white/80",
                )}
              >
                <span>{item.label}</span>
                <ChevronDown className={clsx("size-4 transition", itemsOpen ? "rotate-180" : "rotate-0")} />
              </button>

              {itemsOpen ? (
                <div className="ml-2 grid gap-1 pl-3">
                  {item.children.map((child) => {
                    const childIsActive = pathname === child.href || pathname.startsWith(`${child.href}/`);

                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={clsx(
                          "rounded-lg px-2.5 py-1.5 text-sm transition",
                          childIsActive
                            ? "bg-white/95 font-medium text-slate-900 shadow-sm"
                            : "font-medium text-slate-800 hover:bg-white/80",
                        )}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "rounded-xl px-3 py-2 text-sm transition",
              active
                ? "bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900"
                : "font-medium text-slate-900 hover:bg-white/80",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
