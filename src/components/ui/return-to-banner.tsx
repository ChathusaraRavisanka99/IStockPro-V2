"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const RETURNS: Record<string, { href: string; label: string }> = {
  sales: { href: "/sales", label: "Back to the sale you were making — your bill is kept" },
};

/** Shown on any page opened from another flow (e.g. "Edit full details" in a sale): one tap back. */
export function ReturnToBanner() {
  const params = useSearchParams();
  const target = RETURNS[params.get("from") ?? ""];
  if (!target) return null;
  return (
    <Link href={target.href} className="sticky top-2 z-30 mb-3 flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900 shadow-sm transition hover:bg-sky-100 print:hidden">
      <ArrowLeft className="size-4 shrink-0" />
      {target.label}
    </Link>
  );
}
