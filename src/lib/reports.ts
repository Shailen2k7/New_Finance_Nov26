import { and, eq, gte, lte, ne, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "./db";
import { toISO, monthKey, monthLabel } from "./dates";
import { addDays, format } from "date-fns";
import { monthsInRange, type ReportRange } from "./report-ranges";
export * from "./report-ranges";

function whereFor(range: ReportRange, accountId?: string): SQL {
  const t = schema.transactions;
  const conds: SQL[] = [gte(t.date, range.from), lte(t.date, range.to), ne(t.type, "TRANSFER")];
  if (accountId) conds.push(eq(t.accountId, accountId));
  return and(...conds)!;
}

export type MonthlyRow = { month: string; incomeMinor: number; expenseMinor: number; netMinor: number; cumulativeMinor: number };

export async function getMonthlyPnl(range: ReportRange, accountId?: string): Promise<MonthlyRow[]> {
  const db = await getDb();
  const t = schema.transactions;
  const rows = await db
    .select({
      month: sql<string>`to_char(${t.date}, 'YYYY-MM')`,
      income: sql<number>`coalesce(sum(case when ${t.type} = 'INCOME' then ${t.baseAmountMinor} else 0 end), 0)::bigint`,
      expense: sql<number>`coalesce(sum(case when ${t.type} = 'EXPENSE' then ${t.baseAmountMinor} else 0 end), 0)::bigint`,
    })
    .from(t)
    .where(whereFor(range, accountId))
    .groupBy(sql`to_char(${t.date}, 'YYYY-MM')`);
  const byMonth = new Map(rows.map((r) => [r.month, { income: Number(r.income), expense: Number(r.expense) }]));
  let cumulative = 0;
  return monthsInRange(range).map((m) => {
    const r = byMonth.get(m) ?? { income: 0, expense: 0 };
    const net = r.income + r.expense; // expense is negative
    cumulative += net;
    return { month: m, incomeMinor: r.income, expenseMinor: r.expense, netMinor: net, cumulativeMinor: cumulative };
  });
}

export type CashflowBucket = { key: string; label: string; incomeMinor: number; expenseMinor: number; netMinor: number };

/** Income vs expenses per day for short ranges, per month otherwise. */
export async function getCashflow(range: ReportRange, accountId?: string): Promise<{ bucket: "day" | "month"; rows: CashflowBucket[] }> {
  const from = new Date(range.from + "T00:00:00"), to = new Date(range.to + "T00:00:00");
  const daysLong = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
  if (daysLong > 62) {
    const monthly = await getMonthlyPnl(range, accountId);
    return { bucket: "month", rows: monthly.map((m) => ({ key: m.month, label: monthLabel(m.month), incomeMinor: m.incomeMinor, expenseMinor: m.expenseMinor, netMinor: m.netMinor })) };
  }
  const db = await getDb();
  const t = schema.transactions;
  const rows = await db
    .select({
      day: sql<string>`to_char(${t.date}, 'YYYY-MM-DD')`,
      income: sql<number>`coalesce(sum(case when ${t.type} = 'INCOME' then ${t.baseAmountMinor} else 0 end), 0)::bigint`,
      expense: sql<number>`coalesce(sum(case when ${t.type} = 'EXPENSE' then ${t.baseAmountMinor} else 0 end), 0)::bigint`,
    })
    .from(t)
    .where(whereFor(range, accountId))
    .groupBy(sql`to_char(${t.date}, 'YYYY-MM-DD')`);
  const byDay = new Map(rows.map((r) => [r.day, { income: Number(r.income), expense: Number(r.expense) }]));
  const out: CashflowBucket[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const key = toISO(d);
    const r = byDay.get(key) ?? { income: 0, expense: 0 };
    out.push({ key, label: format(d, "d MMM"), incomeMinor: r.income, expenseMinor: r.expense, netMinor: r.income + r.expense });
  }
  return { bucket: "day", rows: out };
}

export type CategoryRow = { categoryId: string | null; name: string; color: string; amountMinor: number; count: number; share: number };

export async function getCategoryBreakdown(range: ReportRange, type: "INCOME" | "EXPENSE", accountId?: string): Promise<CategoryRow[]> {
  const db = await getDb();
  const t = schema.transactions;
  const rows = await db
    .select({
      categoryId: t.categoryId,
      name: schema.categories.name,
      color: schema.categories.color,
      amount: sql<number>`coalesce(sum(${t.baseAmountMinor}), 0)::bigint`,
      count: sql<number>`count(*)::int`,
    })
    .from(t)
    .leftJoin(schema.categories, eq(schema.categories.id, t.categoryId))
    .where(and(whereFor(range, accountId), eq(t.type, type)))
    .groupBy(t.categoryId, schema.categories.name, schema.categories.color);
  const list = rows.map((r) => ({
    categoryId: r.categoryId,
    name: r.name ?? "Uncategorized",
    color: r.color ?? "#9ca3af",
    amountMinor: Number(r.amount),
    count: Number(r.count),
    share: 0,
  }));
  const total = list.reduce((a, r) => a + Math.abs(r.amountMinor), 0);
  for (const r of list) r.share = total ? Math.round((Math.abs(r.amountMinor) / total) * 1000) / 10 : 0;
  return list.sort((a, b) => Math.abs(b.amountMinor) - Math.abs(a.amountMinor));
}

export async function getReportTotals(range: ReportRange, accountId?: string) {
  const db = await getDb();
  const t = schema.transactions;
  const [r] = await db
    .select({
      income: sql<number>`coalesce(sum(case when ${t.type} = 'INCOME' then ${t.baseAmountMinor} else 0 end), 0)::bigint`,
      expense: sql<number>`coalesce(sum(case when ${t.type} = 'EXPENSE' then ${t.baseAmountMinor} else 0 end), 0)::bigint`,
      count: sql<number>`count(*)::int`,
    })
    .from(t)
    .where(whereFor(range, accountId));
  const incomeMinor = Number(r?.income ?? 0);
  const expenseMinor = Number(r?.expense ?? 0);
  const netMinor = incomeMinor + expenseMinor;
  const margin = incomeMinor ? Math.round((netMinor / incomeMinor) * 1000) / 10 : 0;
  return { incomeMinor, expenseMinor, netMinor, margin, count: Number(r?.count ?? 0) };
}
