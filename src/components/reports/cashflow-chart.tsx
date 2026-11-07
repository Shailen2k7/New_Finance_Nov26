"use client";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { compactAxis, formatMoney, toMinor } from "@/lib/money";

type Point = { month: string; income: number; expenses: number; net: number };

function ChartTooltip({ active, payload, label, currency }: { active?: boolean; payload?: Array<{ dataKey: string; value: number; color: string; name: string }>; label?: string; currency: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3.5 py-3 shadow-pop">
      <p className="mb-2 text-[12px] font-medium text-muted">{label}</p>
      <div className="space-y-1.5">
        {payload.map((p) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-6 text-[13px]">
            <span className="flex items-center gap-2 text-ink-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
              {p.name}
            </span>
            <span className="tnum font-medium text-ink">{formatMoney(toMinor(p.value), currency)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CashflowChart({ data, currency }: { data: Point[]; currency: string }) {
  const empty = data.every((d) => d.income === 0 && d.expenses === 0);
  return (
    <div className="h-[320px] w-full">
      {empty && <p className="pb-2 text-center text-[13px] text-muted">No transactions in this period yet.</p>}
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }} barGap={4}>
          <CartesianGrid vertical={false} stroke="#edf0eb" />
          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#6b7280" }} dy={8} />
          <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#6b7280" }} tickFormatter={(v: number) => compactAxis(v, currency)} width={48} />
          <Tooltip cursor={{ fill: "#f4f7f2" }} content={<ChartTooltip currency={currency} />} />
          <Legend verticalAlign="top" align="right" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "#6b7280", paddingBottom: 12 }} />
          <Bar dataKey="income" name="Income" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} maxBarSize={36} />
          <Bar dataKey="expenses" name="Expenses" fill="var(--color-chart-2)" radius={[6, 6, 0, 0]} maxBarSize={36} />
          <Line type="monotone" dataKey="net" name="Net" stroke="#111827" strokeWidth={2} dot={{ r: 3, strokeWidth: 2, fill: "#fff" }} activeDot={{ r: 5 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
