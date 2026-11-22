"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Boxes, CircleDollarSign, Eye, EyeOff, FileClock, Headphones, Package, Receipt, RotateCcw, Smartphone, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";

// Icons are referenced by name: the widget list comes from a Server Component and
// component functions can't cross that boundary.
const ICONS: Record<string, LucideIcon> = {
  sales: CircleDollarSign,
  profit: TrendingUp,
  invoices: FileClock,
  phones: Smartphone,
  alert: AlertTriangle,
  receipt: Receipt,
  returns: RotateCcw,
  inventory: Boxes,
  accessories: Headphones,
  value: Wallet,
  package: Package,
};

export type DashboardWidget = {
  id: string;
  title: string;
  value: string;
  helper?: string;
  icon?: keyof typeof ICONS;
  change?: number | null;
  changeLabel?: string;
  invertChange?: boolean;
  attention?: boolean;
  href?: string;
};

const STORAGE_KEY = "istockpro-dashboard-layout";

export function DashboardWidgetLayout({ widgets }: { widgets: DashboardWidget[] }) {
  const defaultOrder = widgets.map((widget) => widget.id);
  const [order, setOrder] = useState(defaultOrder);
  const [hidden, setHidden] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      // Keep saved ordering, append widgets added since, drop ones that no longer exist.
      if (Array.isArray(saved?.order)) {
        const known = (saved.order as string[]).filter((id) => defaultOrder.includes(id));
        setOrder([...known, ...defaultOrder.filter((id) => !known.includes(id))]);
      }
      if (Array.isArray(saved?.hidden)) setHidden(saved.hidden);
    } catch {
      // storage unavailable — use defaults
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function save(nextOrder: string[], nextHidden: string[]) {
    setOrder(nextOrder);
    setHidden(nextHidden);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ order: nextOrder, hidden: nextHidden }));
    } catch {
      // ignore
    }
  }

  function move(id: string, direction: -1 | 1) {
    const index = order.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    save(next, hidden);
  }

  const byId = new Map(widgets.map((widget) => [widget.id, widget]));
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2 print:hidden">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Key numbers</h2>
        <div className="flex gap-2">
          {editing ? (
            <button type="button" onClick={() => save(defaultOrder, [])} className="btn btn-xs btn-secondary">
              Reset
            </button>
          ) : null}
          <button type="button" onClick={() => setEditing(!editing)} className={`rounded-lg border px-3 py-1.5 text-xs ${editing ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"}`}>
            {editing ? "Done" : "Customize"}
          </button>
        </div>
      </div>
      {editing ? (
        <Card className="mb-4 print:hidden">
          <p className="mb-2 text-xs text-slate-500">Reorder or hide tiles. Saved in this browser.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {order.map((id, index) => {
              const widget = byId.get(id);
              if (!widget) return null;
              const isHidden = hidden.includes(id);
              return (
                <div key={id} className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${isHidden ? "border-dashed border-slate-200 text-slate-400" : "border-slate-200"}`}>
                  <span>{widget.title}</span>
                  <span className="flex gap-1">
                    <button type="button" aria-label={`Move ${widget.title} up`} onClick={() => move(id, -1)} disabled={index === 0} className="rounded border border-slate-200 p-1 disabled:opacity-30">
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button type="button" aria-label={`Move ${widget.title} down`} onClick={() => move(id, 1)} disabled={index === order.length - 1} className="rounded border border-slate-200 p-1 disabled:opacity-30">
                      <ArrowDown className="size-3.5" />
                    </button>
                    <button type="button" aria-label={isHidden ? `Show ${widget.title}` : `Hide ${widget.title}`} onClick={() => save(order, isHidden ? hidden.filter((item) => item !== id) : [...hidden, id])} className="rounded border border-slate-200 p-1">
                      {isHidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {order.map((id) => {
          const widget = byId.get(id);
          if (!widget || hidden.includes(id)) return null;
          const Icon = widget.icon ? ICONS[widget.icon] : null;
          return (
            <StatCard
              key={widget.id}
              label={widget.title}
              value={widget.value}
              helper={widget.helper}
              icon={Icon ? <Icon className="size-4" /> : undefined}
              change={widget.change}
              changeLabel={widget.changeLabel}
              invertChange={widget.invertChange}
              attention={widget.attention}
              href={widget.href}
            />
          );
        })}
      </section>
    </>
  );
}
