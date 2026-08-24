"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";

type Widget = { id: string; title: string; value: string; helper: string; kind?: "stat" | "list"; rows?: { label: string; value: string }[] };

const defaultOrder = ["monthly-sales", "pending-invoices", "in-stock-phones", "low-stock", "sales-count", "returns-count", "accessory-stock", "inventory-value"];

export function DashboardWidgetLayout({ widgets }: { widgets: Widget[] }) {
  const [order, setOrder] = useState(defaultOrder);
  const [hidden, setHidden] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("istockpro-dashboard-layout") || "null");
      if (saved?.order) setOrder(saved.order);
      if (saved?.hidden) setHidden(saved.hidden);
    } catch {
    }
  }, []);

  function save(nextOrder: string[], nextHidden: string[]) {
    setOrder(nextOrder);
    setHidden(nextHidden);
    localStorage.setItem("istockpro-dashboard-layout", JSON.stringify({ order: nextOrder, hidden: nextHidden }));
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
      <div className="mb-4 flex justify-end print:hidden"><button type="button" onClick={() => setEditing(!editing)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800">{editing ? "Done Editing" : "Edit Dashboard"}</button></div>
      {editing ? <Card className="mb-4 print:hidden"><div className="grid gap-2 sm:grid-cols-2">{order.map((id, index) => { const widget = byId.get(id); if (!widget) return null; const isHidden = hidden.includes(id); return <div key={id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"><span>{widget.title}</span><span className="flex gap-1"><button type="button" onClick={() => move(id, -1)} disabled={index === 0} className="rounded border px-2 py-1">Up</button><button type="button" onClick={() => move(id, 1)} disabled={index === order.length - 1} className="rounded border px-2 py-1">Down</button><button type="button" onClick={() => save(order, isHidden ? hidden.filter((item) => item !== id) : [...hidden, id])} className="rounded border px-2 py-1">{isHidden ? "Show" : "Hide"}</button></span></div>; })}</div></Card> : null}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{order.map((id) => { const widget = byId.get(id); if (!widget || hidden.includes(id)) return null; return widget.kind === "list" ? <Card key={widget.id}><p className="text-sm font-medium text-slate-700">{widget.title}</p><div className="mt-3 space-y-2">{widget.rows?.map((row) => <div key={row.label} className="flex justify-between text-sm"><span>{row.label}</span><span className="font-semibold">{row.value}</span></div>)}</div></Card> : <StatCard key={widget.id} label={widget.title} value={widget.value} helper={widget.helper} />; })}</section>
    </>
  );
}
