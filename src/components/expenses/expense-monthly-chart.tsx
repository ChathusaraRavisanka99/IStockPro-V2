"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/currency";


type Row = { month: string; label: string; total: number } & Record<string, number | string>;

export function ExpenseMonthlyChart({ data, series }: { data: Row[]; series: { key: string; label: string; color: string }[] }) {
  if (!data.length) return <p className="text-sm text-slate-600">No expenses in this period.</p>;
  return (
    <div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barCategoryGap="25%">
            <CartesianGrid stroke="#e1e0d9" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#898781", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#898781", fontSize: 12 }} axisLine={false} tickLine={false} width={80} tickFormatter={(value) => (value >= 1000 ? `${Math.round(value / 1000)}k` : String(value))} />
            <Tooltip
              cursor={{ fill: "rgba(148,163,184,0.15)" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as Row;
                return (
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-md">
                    <p className="mb-1 font-semibold">{label} · {formatMoney(row.total)}</p>
                    {[...payload].reverse().filter((item) => Number(item.value) > 0).map((item) => (
                      <p key={String(item.dataKey)} className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5"><span className="inline-block size-2 rounded-sm" style={{ background: item.color }} />{item.name}</span>
                        <span>{formatMoney(Number(item.value))}</span>
                      </p>
                    ))}
                  </div>
                );
              }}
            />
            {series.map((item, index) => (
              <Bar
                key={item.key}
                dataKey={item.key}
                name={item.label}
                stackId="expenses"
                fill={item.color}
                stroke="#ffffff"
                strokeWidth={1}
                maxBarSize={36}
                radius={index === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-label="Legend">
        {series.map((item) => (
          <li key={item.key} className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: item.color }} />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
