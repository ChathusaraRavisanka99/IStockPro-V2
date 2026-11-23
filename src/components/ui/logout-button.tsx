"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";

type Props = {
  name?: string | null;
  role?: string;
};

export function LogoutButton({ name, role }: Props) {
  return (
    <div className="border-t border-white/70 pt-3 dark:border-slate-700/60">
      <div className="mb-3 px-1">
        <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Theme</p>
        <ThemeToggle />
      </div>
      {name ? (
        <p className="truncate px-3 pb-2 text-xs font-medium text-slate-600">
          {name}
          {role ? ` · ${role}` : ""}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-900 transition hover:bg-white/80"
      >
        <LogOut className="size-4" />
        Log out
      </button>
    </div>
  );
}
