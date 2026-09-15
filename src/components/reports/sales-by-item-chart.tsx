"use client";

import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/currency";

type Row = { label: string; qty: number; revenue: number };

// Single categorical slot (blue) — one series (revenue by item), so identity doesn't
// vary per bar; a single hue is correct here per the color formula.
const BAR_COLOR = "#2a78d6";

export function SalesByItemChart({ data }: { data: Row[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // On narrow (mobile) viewports the Y-axis label column has much less room, so it
  // reserves a smaller fixed width and truncates labels more aggressively — otherwise a
  // 150px column eats roughly half the ~282-306px chart width on a 390px phone and
  // similarly-prefixed item names become indistinguishable.
  const yAxisWidth = width < 400 ? 90 : 150;
  const maxChars = width < 400 ? 12 : 22;

  const top = data.slice(0, 8).map((row) => ({ ...row, shortLabel: row.label.length > maxChars ? `${row.label.slice(0, maxChars - 1)}…` : row.label }));

  if (!top.length) {
    return <p className="text-sm text-slate-600">No items sold in this period yet.</p>;
  }

  return (
    <div ref={containerRef} className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={top} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="#e1e0d9" horizontal={false} />
          <XAxis type="number" tick={{ fill: "#898781", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(value) => formatMoney(value)} />
          <YAxis type="category" dataKey="shortLabel" tick={{ fill: "#52514e", fontSize: 12 }} axisLine={false} tickLine={false} width={yAxisWidth} />
          <Tooltip
            formatter={(value) => formatMoney(value as number)}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.label ?? ""}
            contentStyle={{ borderRadius: 8, border: "1px solid #e1e0d9", fontSize: 12 }}
          />
          <Bar dataKey="revenue" name="Revenue" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {top.map((row) => (
              <Cell key={row.label} fill={BAR_COLOR} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
