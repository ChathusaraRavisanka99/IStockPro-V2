import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

type StatCardProps = {
  label: string;
  value: string;
  helper?: string;
  icon?: ReactNode;
  /** Percent change vs. a comparison period; null/undefined hides the badge. */
  change?: number | null;
  changeLabel?: string;
  /** For metrics where going up is bad (e.g. low-stock alerts, returns). */
  invertChange?: boolean;
  /** Draws attention (amber) — e.g. a non-zero alert count. */
  attention?: boolean;
  href?: string;
};

export function StatCard({ label, value, helper, icon, change, changeLabel = "vs last month", invertChange, attention, href }: StatCardProps) {
  const hasChange = change !== null && change !== undefined && Number.isFinite(change);
  const up = hasChange && change! >= 0;
  const good = hasChange && (invertChange ? !up : up);
  const content = (
    <Card className={`h-full transition ${href ? "hover:-translate-y-0.5 hover:shadow-md" : ""} ${attention ? "ring-1 ring-amber-300" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        {icon ? <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${attention ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-600"}`}>{icon}</span> : null}
      </div>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{value}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {hasChange ? (
          <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium ${good ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {up ? "▲" : "▼"} {Math.abs(change!).toFixed(change! !== 0 && Math.abs(change!) < 10 ? 1 : 0)}%
            <span className="sr-only">{up ? "increase" : "decrease"}</span>
          </span>
        ) : null}
        {hasChange ? <span className="text-slate-500">{changeLabel}</span> : null}
        {helper ? <span className="w-full text-slate-500">{helper}</span> : null}
      </div>
    </Card>
  );
  return href ? (
    <Link href={href} className="block h-full rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">
      {content}
    </Link>
  ) : (
    content
  );
}
