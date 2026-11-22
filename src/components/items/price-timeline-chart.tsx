"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/currency";

export type PricePoint = { date: string; retail: number | null; wholesale: number | null; units: number; event: string };

// Categorical slots 1 (blue) and 2 (orange) of the validated reference palette — the same
// pairing the revenue/profit charts use.
const RETAIL = "#2a78d6";
const WHOLESALE = "#eb6834";

function compact(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
}

function TimelineTooltip({ active, payload, showWholesale }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }>; showWholesale: boolean }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as PricePoint;
  return (
    <div className="max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-slate-900">{new Date(point.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
      <p className="flex items-center gap-2 text-slate-700">
        <span className="inline-block h-0.5 w-3" style={{ background: RETAIL }} /> Avg retail <span className="ml-auto pl-3 font-medium text-slate-900">{point.retail !== null ? formatMoney(point.retail) : "—"}</span>
      </p>
      {showWholesale ? (
        <p className="flex items-center gap-2 text-slate-700">
          <span className="inline-block h-0.5 w-3" style={{ background: WHOLESALE }} /> Avg wholesale <span className="ml-auto pl-3 font-medium text-slate-900">{point.wholesale !== null ? formatMoney(point.wholesale) : "—"}</span>
        </p>
      ) : null}
      <p className="mt-1 text-slate-500">
        {point.units} unit{point.units === 1 ? "" : "s"} · {point.event}
      </p>
    </div>
  );
}

/** Step chart of average listed price over time for the selected model/variant. */
export function PriceTimelineChart({ data, showWholesale }: { data: PricePoint[]; showWholesale: boolean }) {
  if (data.length < 1) return <p className="py-10 text-center text-sm text-slate-500">No priced units for this selection yet.</p>;
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-3" style={{ background: RETAIL }} /> Avg retail price</span>
        {showWholesale ? <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-3" style={{ background: WHOLESALE }} /> Avg wholesale price</span> : null}
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: -4, bottom: 0 }}>
            <CartesianGrid stroke="#ecece8" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "#898781", fontSize: 11 }}
              axisLine={{ stroke: "#c3c2b7" }}
              tickLine={false}
              minTickGap={28}
              tickFormatter={(value: string) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            />
            <YAxis tick={{ fill: "#898781", fontSize: 11 }} axisLine={false} tickLine={false} width={48} tickFormatter={compact} domain={["auto", "auto"]} />
            <Tooltip content={(props) => <TimelineTooltip active={props.active} payload={props.payload as ReadonlyArray<{ payload?: unknown }> | undefined} showWholesale={showWholesale} />} />
            <Line type="stepAfter" dataKey="retail" stroke={RETAIL} strokeWidth={2} dot={{ r: 3, fill: RETAIL, stroke: "#fff", strokeWidth: 1.5 }} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} connectNulls />
            {showWholesale ? <Line type="stepAfter" dataKey="wholesale" stroke={WHOLESALE} strokeWidth={2} dot={{ r: 3, fill: WHOLESALE, stroke: "#fff", strokeWidth: 1.5 }} activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} connectNulls /> : null}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
