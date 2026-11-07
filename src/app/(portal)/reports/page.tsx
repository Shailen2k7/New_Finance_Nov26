import { Download } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { listAccounts } from "@/lib/queries";
import { resolveRange, getMonthlyPnl, getCategoryBreakdown, getReportTotals } from "@/lib/reports";
import { formatMoney } from "@/lib/money";
import { formatDate, monthLabel } from "@/lib/dates";
import { StatTile, PageHeader } from "@/components/ui/misc";
import { Card, CardHeader } from "@/components/ui/card";
import { ReportFilters } from "@/components/reports/report-filters";
import { CashflowChart } from "@/components/reports/cashflow-chart";
import { CategoryTable } from "@/components/reports/category-table";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Search = { from?: string; to?: string; preset?: string; account?: string };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const range = resolveRange(sp);
  const accountId = sp.account && /^[0-9a-f-]{36}$/i.test(sp.account) ? sp.account : undefined;
  const [settings, accounts, totals, monthly, incomeCats, expenseCats] = await Promise.all([
    getSettings(),
    listAccounts(true),
    getReportTotals(range, accountId),
    getMonthlyPnl(range, accountId),
    getCategoryBreakdown(range, "INCOME", accountId),
    getCategoryBreakdown(range, "EXPENSE", accountId),
  ]);
  const cur = settings.baseCurrency;
  const exportQs = new URLSearchParams({ from: range.from, to: range.to, ...(accountId ? { account: accountId } : {}) }).toString();

  return (
    <div>
      <PageHeader
        title="Reports"
        description={`Profit & loss and cashflow in ${cur} for ${formatDate(range.from)} – ${formatDate(range.to)}.`}
        actions={
          <a href={`/api/export/report?${exportQs}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-[14px] font-medium text-ink hover:bg-surface-2">
            <Download className="h-4 w-4" /> Export P&amp;L CSV
          </a>
        }
      />

      <ReportFilters key={`${range.from}_${range.to}`} accounts={accounts.map((a) => ({ id: a.id, name: a.name, isArchived: a.isArchived }))} range={range} preset={range.preset} accountId={accountId} />

      <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile label="Income" value={formatMoney(totals.incomeMinor, cur)} sub={`${totals.count} transactions in range`} />
        <StatTile label="Expenses" value={formatMoney(Math.abs(totals.expenseMinor), cur)} />
        <StatTile label="Net profit" value={formatMoney(totals.netMinor, cur)} tone={totals.netMinor >= 0 ? "up" : "down"} sub={totals.netMinor >= 0 ? "Profitable period" : "Loss-making period"} />
        <StatTile label="Profit margin" value={`${totals.margin.toFixed(1)}%`} tone={totals.margin >= 0 ? "up" : "down"} sub="Net profit ÷ income" />
      </div>

      <Card className="mt-5">
        <CardHeader title="Cashflow" subtitle="Monthly income, expenses and net result" />
        <CashflowChart data={monthly.map((m) => ({ month: monthLabel(m.month), income: m.incomeMinor / 100, expenses: Math.abs(m.expenseMinor) / 100, net: m.netMinor / 100 }))} currency={cur} />
      </Card>

      <Card flush className="mt-5">
        <div className="px-6 pt-6"><CardHeader title="Monthly profit & loss" subtitle="Transfers between your own accounts are excluded" /></div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Month</th>
                <th className="text-right">Income</th>
                <th className="text-right">Expenses</th>
                <th className="text-right">Net</th>
                <th className="text-right">Cumulative</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((m) => (
                <tr key={m.month}>
                  <td className="font-medium text-ink">{monthLabel(m.month)}</td>
                  <td className="tnum text-right text-success">{formatMoney(m.incomeMinor, cur)}</td>
                  <td className="tnum text-right text-ink">{formatMoney(Math.abs(m.expenseMinor), cur)}</td>
                  <td className={cn("tnum text-right font-medium", m.netMinor < 0 ? "text-danger" : "text-ink")}>{formatMoney(m.netMinor, cur)}</td>
                  <td className={cn("tnum text-right", m.cumulativeMinor < 0 ? "text-danger" : "text-muted")}>{formatMoney(m.cumulativeMinor, cur)}</td>
                </tr>
              ))}
              <tr className="bg-surface-2 font-semibold">
                <td>Total</td>
                <td className="tnum text-right text-success">{formatMoney(totals.incomeMinor, cur)}</td>
                <td className="tnum text-right">{formatMoney(Math.abs(totals.expenseMinor), cur)}</td>
                <td className={cn("tnum text-right", totals.netMinor < 0 ? "text-danger" : "text-ink")}>{formatMoney(totals.netMinor, cur)}</td>
                <td className="tnum text-right text-muted">{formatMoney(totals.netMinor, cur)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:gap-5 xl:grid-cols-2">
        <CategoryTable title="Income by category" rows={incomeCats} currency={cur} tone="income" />
        <CategoryTable title="Expenses by category" rows={expenseCats} currency={cur} tone="expense" />
      </div>
    </div>
  );
}
