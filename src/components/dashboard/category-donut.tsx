"use client";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { formatMoney } from "@/lib/money";
import type { CategoryRow } from "@/lib/reports";

export function CategoryDonut({ rows, currency, total }: { rows: CategoryRow[]; currency: string; total: number }) {
  const data = rows.map((r) => ({ name: r.name, value: r.amountMinor, color: r.color }));
  return (
    <div className="relative h-[180px] w-[180px] shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius={58} outerRadius={82} paddingAngle={3} cornerRadius={6} stroke="none">
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip content={({ active, payload }) => active && payload?.length ? <div className="rounded-xl border border-line bg-surface px-3 py-2 text-[13px] shadow-pop"><span className="font-medium">{payload[0].name}</span> · {formatMoney(Number(payload[0].value), currency)}</div> : null} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[11px] text-muted">Total</span>
        <span className="tnum text-[15px] font-semibold">{formatMoney(total, currency, { compact: true })}</span>
      </div>
    </div>
  );
}
