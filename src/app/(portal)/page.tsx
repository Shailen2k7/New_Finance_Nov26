import Link from "next/link";
import { ArrowRight, Plus, FileUp, Landmark, Repeat, AlertTriangle, TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { getDashboardData } from "@/lib/dashboard";
import { resolveDashRange, datesLabel } from "@/lib/report-ranges";
import { formatMoney } from "@/lib/money";
import { businessNow, formatDate } from "@/lib/dates";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ColorDot, EmptyState, InitialAvatar, ProgressBar } from "@/components/ui/misc";
import { CashflowChart } from "@/components/dashboard/cashflow-chart";
import { CategoryDonut } from "@/components/dashboard/category-donut";
import { RangePicker } from "@/components/dashboard/range-picker";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function delta(now: number, before: number) {
  if (!before) return null;
  return Math.round(((now - before) / Math.abs(before)) * 100);
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string; days?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const range = resolveDashRange(sp);
  const d = await getDashboardData(range);
  const cur = d.base;
  const expenses = Math.abs(d.totals.expenseMinor);
  const prevExpenses = Math.abs(d.prevTotals.expenseMinor);
  const incomeDelta = delta(d.totals.incomeMinor, d.prevTotals.incomeMinor);
  const expenseDelta = delta(expenses, prevExpenses);
  const net = d.totals.incomeMinor - expenses;
  const prevNet = d.prevTotals.incomeMinor - prevExpenses;
  const netDelta = delta(net, prevNet);
  const attentionItems = [
    d.attention.pendingReviews > 0 && { label: `${d.attention.pendingReviews} statement import${d.attention.pendingReviews > 1 ? "s" : ""} waiting for review`, href: "/import" },
    d.attention.uncategorized > 0 && { label: `${d.attention.uncategorized} uncategorized transaction${d.attention.uncategorized > 1 ? "s" : ""}`, href: "/transactions?uncategorized=1" },
    d.attention.overdueRecurring > 0 && { label: `${d.attention.overdueRecurring} overdue recurring payment${d.attention.overdueRecurring > 1 ? "s" : ""}`, href: "/recurring" },
  ].filter(Boolean) as { label: string; href: string }[];
  const hasData = d.cashflow.rows.some((m) => m.incomeMinor || m.expenseMinor);
  const expenseTotal = d.expenseCats.reduce((a, c) => a + Math.abs(c.amountMinor), 0);
  const dates = datesLabel(range);
  const rangeLabel = range.key === "custom" ? dates : `${range.label} · ${dates}`;
  const hour = businessNow().getHours();

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight sm:text-[24px]">Good {hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"} 👋</h1>
          <p className="mt-1 text-[14px] text-muted">{d.businessName} · {rangeLabel} · amounts in {cur}</p>
        </div>
        <RangePicker activeKey={range.key} label={range.label} from={range.from} to={range.to} />
      </div>

      {attentionItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-warning/30 bg-warning-50 px-4 py-3 text-[13px]">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <span className="font-medium text-ink">Needs attention:</span>
          {attentionItems.map((a) => <Link key={a.href} href={a.href} className="rounded-full bg-surface px-3 py-1 text-ink-2 shadow-sm hover:text-primary">{a.label} →</Link>)}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi label="Total balance" value={formatMoney(d.totalBaseMinor, cur)} sub={`${d.accounts.length} account${d.accounts.length === 1 ? "" : "s"}`} icon={<Wallet className="h-4 w-4" />} tile="tile-sky" iconClass="bg-sky text-[#2f6fed]" />
        <Kpi label="Income" value={formatMoney(d.totals.incomeMinor, cur)} delta={incomeDelta} good="up" icon={<TrendingUp className="h-4 w-4" />} tile="tile-mint" iconClass="bg-mint text-success" />
        <Kpi label="Expenses" value={formatMoney(expenses, cur)} delta={expenseDelta} good="down" icon={<TrendingDown className="h-4 w-4" />} tile="tile-apricot" iconClass="bg-apricot text-accent" />
        <Kpi label="Net profit" value={formatMoney(net, cur)} delta={netDelta} good="up" tone={net >= 0 ? "ok" : "bad"} icon={<ArrowUpRight className="h-4 w-4" />} tile="tile-sand" iconClass="bg-sand text-[#9a7b2f]" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader title="Cashflow" subtitle={`Income vs expenses by ${d.cashflow.bucket} · ${cur}`} action={<div className="flex items-center gap-4 text-[12px] text-muted"><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-chart-1" /> Income</span><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-chart-2" /> Expenses</span></div>} />
          {hasData ? <CashflowChart data={d.cashflow.rows} currency={cur} daily={d.cashflow.bucket === "day"} /> : <EmptyState icon={<FileUp className="h-5 w-5" />} title="No transactions yet" description="Import a bank statement or add your first transaction to see your cashflow." action={<Link href="/import" className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-[14px] font-medium text-white">Import statement</Link>} />}
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Accounts" action={<Link href="/accounts" className="text-[13px] text-primary">Manage</Link>} />
            {d.accounts[0] && (
              <div className="relative mb-4 overflow-hidden rounded-2xl p-5 text-white shadow-md" style={{ background: `linear-gradient(135deg, ${d.accounts[0].color} 0%, #1f4d3a 140%)` }}>
                <div className="flex items-start justify-between">
                  <span className="text-[12px] text-white/80">{d.accounts[0].institution ?? d.accounts[0].type}</span>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-80"><path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" /></svg>
                </div>
                <p className="tnum mt-6 text-[26px] font-semibold tracking-tight">{formatMoney(d.accounts[0].balanceMinor, d.accounts[0].currency)}</p>
                <div className="mt-3 flex items-center justify-between text-[12px] text-white/85">
                  <span>{d.accounts[0].name}</span>
                  <span className="tnum tracking-[0.2em]">{d.accounts[0].lastFour ? `•••• ${d.accounts[0].lastFour}` : d.accounts[0].currency}</span>
                </div>
              </div>
            )}
            <div className="space-y-2.5">
              {d.accounts.slice(d.accounts[0] ? 1 : 0).map((a) => (
                <div key={a.id} className="flex items-center justify-between text-[14px]">
                  <span className="flex items-center gap-2.5"><ColorDot color={a.color} /> <span className="text-ink-2">{a.name}</span></span>
                  <span className="tnum font-medium">{formatMoney(a.balanceMinor, a.currency)}</span>
                </div>
              ))}
              {d.accounts.length === 0 && <p className="text-[13px] text-muted">No accounts yet. <Link href="/accounts" className="text-primary">Add one</Link></p>}
            </div>
          </Card>
          <Card>
            <CardHeader title="Quick actions" />
            <div className="grid grid-cols-2 gap-2">
              <QuickAction href="/transactions?new=1" icon={<Plus className="h-4 w-4" />} label="Add transaction" />
              <QuickAction href="/import" icon={<FileUp className="h-4 w-4" />} label="Import statement" />
              <QuickAction href="/loans?new=1" icon={<Landmark className="h-4 w-4" />} label="Add loan" />
              <QuickAction href="/recurring?new=1" icon={<Repeat className="h-4 w-4" />} label="Add recurring" />
            </div>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Expenses by category" action={<Link href="/expenses" className="text-[13px] text-primary">View all</Link>} />
          {d.expenseCats.length ? (
            <div className="flex flex-col items-center gap-6 md:flex-row md:items-center">
              <CategoryDonut rows={d.expenseCats.map((c) => ({ ...c, amountMinor: Math.abs(c.amountMinor) }))} currency={cur} total={expenses} />
              <ul className="grid w-full min-w-0 flex-1 gap-x-8 gap-y-3 2xl:grid-cols-2">
                {d.expenseCats.map((c) => (
                  <li key={c.categoryId ?? "none"} className="text-[13px]">
                    <div className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-2"><ColorDot color={c.color} /><span className="truncate text-ink-2">{c.name}</span></span><span className="tnum font-medium">{formatMoney(Math.abs(c.amountMinor), cur)}</span></div>
                    <ProgressBar value={expenseTotal ? (Math.abs(c.amountMinor) / expenseTotal) * 100 : 0} color={c.color} className="mt-1 h-1" />
                  </li>
                ))}
              </ul>
            </div>
          ) : <p className="py-8 text-center text-[13px] text-muted">No expenses in this period.</p>}
        </Card>
        <Card>
          <CardHeader title="Income sources" action={<Link href="/income" className="text-[13px] text-primary">View all</Link>} />
          {d.incomeCats.length ? (
            <ul className="space-y-3">
              {d.incomeCats.map((c) => (
                <li key={c.categoryId ?? "none"} className="text-[13px]">
                  <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><ColorDot color={c.color} /><span className="text-ink-2">{c.name}</span><span className="text-faint">· {c.count}</span></span><span className="tnum font-medium">{formatMoney(c.amountMinor, cur)}</span></div>
                  <ProgressBar value={c.share} color={c.color} className="mt-1.5 h-1.5" />
                </li>
              ))}
            </ul>
          ) : <p className="py-8 text-center text-[13px] text-muted">No income in this period.</p>}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card flush>
          <div className="flex items-center justify-between px-5 pt-5 sm:px-6 sm:pt-6"><h3 className="text-[16px] font-semibold">Recent transactions</h3><Link href="/transactions" className="inline-flex items-center gap-1 text-[13px] text-primary">All transactions <ArrowRight className="h-3.5 w-3.5" /></Link></div>
          <div className="mt-3 divide-y divide-line">
            {d.recent.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                <InitialAvatar seed={t.merchant || t.description} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-ink">{t.merchant || t.description}</p>
                  <p className="truncate text-[12px] text-muted">{formatDate(t.date)} · {t.accountName}{t.categoryName ? ` · ${t.categoryName}` : ""}</p>
                </div>
                <div className="text-right">
                  <p className={cn("tnum text-[14px] font-semibold", t.amountMinor > 0 ? "text-success" : "text-ink")}>{formatMoney(t.amountMinor, t.currency, { signed: true })}</p>
                  {t.currency !== cur && <p className="tnum text-[11px] text-muted">{formatMoney(t.baseAmountMinor, cur)}</p>}
                </div>
              </div>
            ))}
            {d.recent.length === 0 && <p className="px-6 py-8 text-center text-[13px] text-muted">No transactions yet.</p>}
          </div>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Upcoming payments" subtitle="Next 30 days" action={<Link href="/recurring" className="text-[13px] text-primary">Recurring</Link>} />
            <ul className="space-y-2.5">
              {d.overdue.map((r) => <UpcomingRow key={r.id} r={r} overdue />)}
              {d.upcoming.map((r) => <UpcomingRow key={r.id} r={r} />)}
              {d.upcoming.length === 0 && d.overdue.length === 0 && <p className="py-6 text-center text-[13px] text-muted">Nothing due. <Link href="/recurring?new=1" className="text-primary">Add a recurring payment</Link></p>}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Loans" action={<Link href="/loans" className="text-[13px] text-primary">Manage</Link>} />
            {d.loans.length ? (
              <ul className="space-y-4">
                {d.loans.map((l) => (
                  <li key={l.id}>
                    <div className="flex items-center justify-between text-[13px]"><span className="flex items-center gap-2 font-medium text-ink">{l.name} <Badge tone={l.direction === "BORROWED" ? "amber" : "blue"}>{l.direction === "BORROWED" ? "Borrowed" : "Lent"}</Badge></span><span className="tnum">{formatMoney(l.outstandingMinor, l.currency)}</span></div>
                    <ProgressBar value={l.principalMinor ? ((l.principalMinor - l.outstandingMinor) / l.principalMinor) * 100 : 0} className="mt-1.5" />
                    <p className="mt-1 text-[11px] text-muted">{Math.round(l.principalMinor ? ((l.principalMinor - l.outstandingMinor) / l.principalMinor) * 100 : 0)}% repaid of {formatMoney(l.principalMinor, l.currency)}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="py-6 text-center text-[13px] text-muted">No active loans. <Link href="/loans?new=1" className="text-primary">Add a loan</Link></p>}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, delta, good, tone, icon, tile, iconClass }: { label: string; value: string; sub?: string; delta?: number | null; good?: "up" | "down"; tone?: "ok" | "bad"; icon: React.ReactNode; tile?: string; iconClass?: string }) {
  const positive = typeof delta === "number" && (good === "up" ? delta >= 0 : delta <= 0);
  return (
    <div className={cn("card min-w-0 p-4 sm:p-5", tile)}>
      <div className="flex items-center justify-between gap-2"><p className="truncate text-[13px] text-muted">{label}</p><span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", iconClass ?? "bg-primary-50 text-primary")}>{icon}</span></div>
      <p className={cn("stat-value mt-2", tone === "ok" ? "text-success" : tone === "bad" ? "text-danger" : "text-ink")}>{value}</p>
      {typeof delta === "number" ? (
        <p className={cn("mt-1 flex items-center gap-1 truncate text-[12px]", positive ? "text-success" : "text-danger")}>{delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}{Math.abs(delta).toLocaleString("en-IN")}% vs previous</p>
      ) : sub ? <p className="mt-1 text-[12px] text-muted">{sub}</p> : <p className="mt-1 text-[12px] text-muted">No previous period data</p>}
    </div>
  );
}

function QuickAction({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3 py-3 text-[13px] font-medium text-ink-2 transition hover:border-primary/40 hover:bg-primary-50 hover:text-primary">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface text-primary shadow-sm">{icon}</span>{label}
    </Link>
  );
}

function UpcomingRow({ r, overdue }: { r: { id: string; name: string; amountMinor: number; currency: string; nextDueDate: string; categoryColor: string | null }; overdue?: boolean }) {
  return (
    <li className="flex items-center justify-between text-[13px]">
      <span className="flex min-w-0 items-center gap-2.5"><ColorDot color={r.categoryColor ?? "#94a3b8"} /><span className="truncate text-ink-2">{r.name}</span>{overdue && <Badge tone="red">Overdue</Badge>}</span>
      <span className="flex shrink-0 items-center gap-3"><span className="text-[12px] text-muted">{formatDate(r.nextDueDate, "d MMM")}</span><span className={cn("tnum font-medium", r.amountMinor > 0 ? "text-success" : "text-ink")}>{formatMoney(r.amountMinor, r.currency, { signed: true })}</span></span>
    </li>
  );
}
