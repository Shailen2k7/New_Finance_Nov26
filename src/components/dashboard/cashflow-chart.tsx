"use client";
import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { compactAxis, formatMoney } from "@/lib/money";
import type { CashflowBucket } from "@/lib/reports";

export function CashflowChart({ data, currency, daily = false }: { data: CashflowBucket[]; currency: string; daily?: boolean }) {
  const [active, setActive] = useState<number | null>(null);
  const rows = data.map((m) => ({ name: m.label, income: m.incomeMinor / 100, expense: Math.abs(m.expenseMinor) / 100, net: m.netMinor / 100 }));
  const fmtAxis = (v: number) => compactAxis(v, currency);
  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} barCategoryGap={daily && rows.length > 20 ? "16%" : "24%"} barGap={daily && rows.length > 20 ? 1 : 3} onMouseMove={(s) => { const i = (s as { activeTooltipIndex?: number }).activeTooltipIndex; if (typeof i === "number") setActive(i); }} onMouseLeave={() => setActive(null)} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#edeff3" />
          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#6b7280", fontSize: 12 }} dy={8} interval="preserveStartEnd" minTickGap={14} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: "#6b7280", fontSize: 12 }} tickFormatter={fmtAxis} width={44} />
          <Tooltip cursor={{ fill: "#f4f7f2" }} content={({ active: a, payload, label }) => {
            if (!a || !payload?.length) return null;
            const p = payload[0].payload as { income: number; expense: number; net: number };
            return (
              <div className="rounded-xl border border-line bg-surface px-3.5 py-3 text-[13px] shadow-pop">
                <p className="mb-2 text-[12px] text-muted">{label}</p>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-6"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-chart-1" /> Income</span><span className="tnum font-medium">{formatMoney(Math.round(p.income * 100), currency)}</span></div>
                  <div className="flex items-center justify-between gap-6"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-chart-2" /> Expenses</span><span className="tnum font-medium">{formatMoney(Math.round(p.expense * 100), currency)}</span></div>
                  <div className="flex items-center justify-between gap-6 border-t border-line pt-1.5"><span className="text-muted">Net</span><span className={`tnum font-semibold ${p.net >= 0 ? "text-success" : "text-danger"}`}>{formatMoney(Math.round(p.net * 100), currency, { signed: true })}</span></div>
                </div>
              </div>
            );
          }} />
          <Bar dataKey="income" fill="var(--color-chart-1)" radius={[5, 5, 0, 0]} maxBarSize={daily && rows.length > 20 ? 14 : 30}>
            {rows.map((_, i) => <Cell key={i} fillOpacity={active === null || i === active ? 1 : 0.45} />)}
          </Bar>
          <Bar dataKey="expense" fill="var(--color-chart-2)" radius={[5, 5, 0, 0]} maxBarSize={daily && rows.length > 20 ? 14 : 30}>
            {rows.map((_, i) => <Cell key={i} fillOpacity={active === null || i === active ? 1 : 0.45} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
