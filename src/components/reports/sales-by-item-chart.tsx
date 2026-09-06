"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/currency";

type Row = { label: string; qty: number; revenue: number };

// Single categorical slot (blue) — one series (revenue by item), so identity doesn't
// vary per bar; a single hue is correct here per the color formula.
const BAR_COLOR = "#2a78d6";

export function SalesByItemChart({ data }: { data: Row[] }) {
  const top = data.slice(0, 8).map((row) => ({ ...row, shortLabel: row.label.length > 22 ? `${row.label.slice(0, 21)}…` : row.label }));

  if (!top.length) {
    return <p className="text-sm text-slate-600">No items sold in this period yet.</p>;
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={top} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="#e1e0d9" horizontal={false} />
          <XAxis type="number" tick={{ fill: "#898781", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(value) => formatMoney(value)} />
          <YAxis type="category" dataKey="shortLabel" tick={{ fill: "#52514e", fontSize: 12 }} axisLine={false} tickLine={false} width={150} />
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
