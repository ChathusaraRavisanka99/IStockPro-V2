"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/currency";

type Point = { date: string; revenue: number; profit: number };

// Categorical slots 1 (blue) & 2 (orange) from the validated palette — adjacent slots,
// guaranteed distinct under both normal and color-vision-deficient simulation.
const REVENUE_COLOR = "#2a78d6";
const PROFIT_COLOR = "#eb6834";

export function RevenueTrendChart({ data }: { data: Point[] }) {
  if (!data.length) {
    return <p className="text-sm text-slate-600">No completed sales in this period yet.</p>;
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e1e0d9" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: "#898781", fontSize: 12 }} axisLine={{ stroke: "#c3c2b7" }} tickLine={false} />
          <YAxis tick={{ fill: "#898781", fontSize: 12 }} axisLine={false} tickLine={false} width={80} tickFormatter={(value) => formatMoney(value)} />
          <Tooltip
            formatter={(value, name) => [formatMoney(value as number), name]}
            contentStyle={{ borderRadius: 8, border: "1px solid #e1e0d9", fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "#52514e" }} />
          <Line type="monotone" dataKey="revenue" name="Revenue" stroke={REVENUE_COLOR} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          <Line type="monotone" dataKey="profit" name="Gross profit" stroke={PROFIT_COLOR} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
