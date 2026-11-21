"use client";

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/currency";

type Point = { date: string; label: string; revenue: number; profit: number; sales: number };

// Categorical slots 1 (blue) and 2 (orange) from the validated reference palette — the same
// pair the Reports revenue chart uses, so "revenue" and "profit" read the same everywhere.
const REVENUE = "#2a78d6";
const PROFIT = "#eb6834";

function compact(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
}

function TrendTooltip({ active, payload, showProfit }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }>; showProfit: boolean }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as Point;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-slate-900">{new Date(point.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</p>
      <p className="flex items-center gap-2 text-slate-700">
        <span className="inline-block size-2 rounded-sm" style={{ background: REVENUE }} />
        Revenue <span className="ml-auto pl-3 font-medium text-slate-900">{formatMoney(point.revenue)}</span>
      </p>
      {showProfit ? (
        <p className="flex items-center gap-2 text-slate-700">
          <span className="inline-block h-0.5 w-2" style={{ background: PROFIT }} />
          Gross profit <span className="ml-auto pl-3 font-medium text-slate-900">{formatMoney(point.profit)}</span>
        </p>
      ) : null}
      <p className="mt-1 text-slate-500">
        {point.sales} sale{point.sales === 1 ? "" : "s"}
      </p>
    </div>
  );
}

export function SalesTrendChart({ data, showProfit }: { data: Point[]; showProfit: boolean }) {
  const hasSales = data.some((point) => point.revenue > 0);
  return (
    <div>
      {showProfit ? (
        <div className="mb-2 flex flex-wrap gap-4 text-xs text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: REVENUE }} />
            Revenue
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3" style={{ background: PROFIT }} />
            Gross profit
          </span>
        </div>
      ) : null}
      <div className="relative h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barCategoryGap="25%">
            <CartesianGrid stroke="#ecece8" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#898781", fontSize: 11 }} axisLine={{ stroke: "#c3c2b7" }} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
            <YAxis tick={{ fill: "#898781", fontSize: 11 }} axisLine={false} tickLine={false} width={44} tickFormatter={compact} />
            <Tooltip cursor={{ fill: "rgba(15, 23, 42, 0.05)" }} content={(props) => <TrendTooltip active={props.active} payload={props.payload as ReadonlyArray<{ payload?: unknown }> | undefined} showProfit={showProfit} />} />
            <Bar dataKey="revenue" name="Revenue" fill={REVENUE} radius={[4, 4, 0, 0]} maxBarSize={18} />
            {showProfit ? <Line type="monotone" dataKey="profit" name="Gross profit" stroke={PROFIT} strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} /> : null}
          </ComposedChart>
        </ResponsiveContainer>
        {!hasSales ? <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">No completed sales in the last 30 days.</p> : null}
      </div>
    </div>
  );
}
