"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/currency";

type Row = { category: string; cost: number; retail: number };

// Categorical slots 1 (blue) & 2 (orange) — two series (cost basis vs retail value)
// per category, adjacent slots guaranteed distinct.
const COST_COLOR = "#2a78d6";
const RETAIL_COLOR = "#eb6834";

export function InventoryValuationChart({ data }: { data: Row[] }) {
  if (!data.length) {
    return <p className="text-sm text-slate-600">No inventory recorded yet.</p>;
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e1e0d9" vertical={false} />
          <XAxis dataKey="category" tick={{ fill: "#898781", fontSize: 12 }} axisLine={{ stroke: "#c3c2b7" }} tickLine={false} />
          <YAxis tick={{ fill: "#898781", fontSize: 12 }} axisLine={false} tickLine={false} width={80} tickFormatter={(value) => formatMoney(value)} />
          <Tooltip formatter={(value) => formatMoney(value as number)} contentStyle={{ borderRadius: 8, border: "1px solid #e1e0d9", fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12, color: "#52514e" }} />
          <Bar dataKey="cost" name="Cost basis" fill={COST_COLOR} radius={[4, 4, 0, 0]} maxBarSize={36} />
          <Bar dataKey="retail" name="Retail value" fill={RETAIL_COLOR} radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
