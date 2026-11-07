import { Card, CardHeader } from "@/components/ui/card";
import { ProgressBar, ColorDot, EmptyState } from "@/components/ui/misc";
import { formatMoney } from "@/lib/money";
import type { CategoryRow } from "@/lib/reports";
import { PieChart } from "lucide-react";

export function CategoryTable({ title, rows, currency, tone }: { title: string; rows: CategoryRow[]; currency: string; tone: "income" | "expense" }) {
  const total = rows.reduce((a, r) => a + Math.abs(r.amountMinor), 0);
  return (
    <Card flush>
      <div className="px-6 pt-6">
        <CardHeader title={title} subtitle={`${formatMoney(total, currency)} across ${rows.length} categor${rows.length === 1 ? "y" : "ies"}`} />
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<PieChart className="h-5 w-5" />} title={`No ${tone} in this period`} />
      ) : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Category</th>
                <th className="text-right">Amount</th>
                <th className="w-[160px]">Share</th>
                <th className="text-right">Txns</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.categoryId ?? "none"}>
                  <td>
                    <span className="flex items-center gap-2.5">
                      <ColorDot color={r.color} />
                      <span className="font-medium text-ink">{r.name}</span>
                    </span>
                  </td>
                  <td className="tnum text-right font-medium text-ink">{formatMoney(Math.abs(r.amountMinor), currency)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <ProgressBar value={r.share} color={r.color} className="h-1.5" />
                      <span className="tnum w-12 text-right text-[12px] text-muted">{r.share.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="tnum text-right text-muted">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
