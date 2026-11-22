"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/currency";

export type BarDatum = { label: string; value: number; color?: string; detail?: string };

// Categorical slot 1 of the validated reference palette — single-series bars.
const DEFAULT_BAR = "#2a78d6";

function compact(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
}

function ChartTooltip({ active, payload, money, unit }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }>; money?: boolean; unit?: string }) {
  if (!active || !payload?.length) return null;
  const datum = payload[0].payload as BarDatum;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-slate-900">{datum.label}</p>
      <p className="text-slate-700">{money ? formatMoney(datum.value) : `${datum.value} ${unit ?? ""}`.trim()}</p>
      {datum.detail ? <p className="text-slate-500">{datum.detail}</p> : null}
    </div>
  );
}

/**
 * Horizontal bar chart (one bar per category, sorted by the caller). Bars use the single
 * series color unless a datum carries its own — used for "stock by color", where the bar is
 * painted in the phone color it represents (light colors get an outline so they stay visible).
 */
export function HorizontalBars({ data, money, unit = "units", empty = "No data yet." }: { data: BarDatum[]; money?: boolean; unit?: string; empty?: string }) {
  if (!data.length) return <p className="py-8 text-center text-sm text-slate-500">{empty}</p>;
  const height = Math.max(120, data.length * 34 + 24);
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 4 }} barCategoryGap="22%">
          <CartesianGrid stroke="#ecece8" horizontal={false} />
          <XAxis type="number" tick={{ fill: "#898781", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={money ? compact : undefined} allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={150} tick={{ fill: "#52514e", fontSize: 12 }} axisLine={false} tickLine={false} interval={0} />
          <Tooltip cursor={{ fill: "rgba(15, 23, 42, 0.05)" }} content={(props) => <ChartTooltip active={props.active} payload={props.payload as ReadonlyArray<{ payload?: unknown }> | undefined} money={money} unit={unit} />} />
          <Bar
            dataKey="value"
            radius={[0, 4, 4, 0]}
            maxBarSize={22}
            label={{ position: "right", fill: "#52514e", fontSize: 11, formatter: (value: unknown) => (money ? compact(Number(value)) : String(value)) }}
          >
            {data.map((datum) => (
              <Cell key={datum.label} fill={datum.color ?? DEFAULT_BAR} stroke={datum.color && isLight(datum.color) ? "#94a3b8" : undefined} strokeWidth={datum.color && isLight(datum.color) ? 1 : 0} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function isLight(hex: string) {
  const v = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 200;
}
