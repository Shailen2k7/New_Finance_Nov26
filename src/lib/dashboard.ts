import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { addDays, subDays } from "date-fns";
import { getDb, schema } from "./db";
import { getSettings } from "./settings";
import { getFxRate } from "./fx";
import { todayISO, toISO } from "./dates";
import { getCashflow, getCategoryBreakdown, getReportTotals, type ReportRange, type ResolvedRange } from "./reports";

export async function getDashboardData(range: ResolvedRange) {
  const db = await getDb();
  const settings = await getSettings();
  const base = settings.baseCurrency;
  const days = range.days;
  const prev: ReportRange = { from: toISO(subDays(new Date(range.from + "T00:00:00"), days)), to: toISO(subDays(new Date(range.from + "T00:00:00"), 1)) };
  const today = todayISO();

  const [totals, prevTotals, cashflow, expenseCats, incomeCats, accounts, balances, recent, upcoming, overdue, loans, loanPaid, uncategorized, pendingReviews] = await Promise.all([
    getReportTotals(range),
    getReportTotals(prev),
    getCashflow(range),
    getCategoryBreakdown(range, "EXPENSE"),
    getCategoryBreakdown(range, "INCOME"),
    db.select().from(schema.accounts).where(eq(schema.accounts.isArchived, false)).orderBy(asc(schema.accounts.createdAt)),
    db.select({ id: schema.accounts.id, sum: sql<number>`coalesce(sum(${schema.transactions.amountMinor}),0)::bigint` }).from(schema.accounts).leftJoin(schema.transactions, eq(schema.transactions.accountId, schema.accounts.id)).groupBy(schema.accounts.id),
    db.query.transactions.findMany({ with: { account: true, category: true }, orderBy: [desc(schema.transactions.date), desc(schema.transactions.createdAt)], limit: 8 }),
    db.query.recurringPayments.findMany({ where: and(eq(schema.recurringPayments.isActive, true), gte(schema.recurringPayments.nextDueDate, today), lte(schema.recurringPayments.nextDueDate, toISO(addDays(new Date(today + "T00:00:00"), 30)))), with: { category: true }, orderBy: asc(schema.recurringPayments.nextDueDate), limit: 6 }),
    db.query.recurringPayments.findMany({ where: and(eq(schema.recurringPayments.isActive, true), sql`${schema.recurringPayments.nextDueDate} < ${today}`), with: { category: true }, orderBy: asc(schema.recurringPayments.nextDueDate) }),
    db.query.loans.findMany({ where: eq(schema.loans.status, "ACTIVE") }),
    db.select({ loanId: schema.loanPayments.loanId, principal: sql<number>`coalesce(sum(${schema.loanPayments.principalMinor}),0)::bigint` }).from(schema.loanPayments).groupBy(schema.loanPayments.loanId),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.transactions).where(and(isNull(schema.transactions.categoryId), sql`${schema.transactions.type} <> 'TRANSFER'`)),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.importBatches).where(eq(schema.importBatches.status, "REVIEW")),
  ]);

  const sumById = new Map(balances.map((b) => [b.id, Number(b.sum)]));
  const accountCards = [] as { id: string; name: string; institution: string | null; type: string; currency: string; lastFour: string | null; color: string; balanceMinor: number; baseBalanceMinor: number }[];
  let totalBaseMinor = 0;
  for (const a of accounts) {
    const balanceMinor = a.openingBalanceMinor + (sumById.get(a.id) ?? 0);
    const { rate } = await getFxRate(a.currency, base, today);
    const baseBalanceMinor = Math.round(balanceMinor * rate);
    totalBaseMinor += baseBalanceMinor;
    accountCards.push({ id: a.id, name: a.name, institution: a.institution, type: a.type, currency: a.currency, lastFour: a.lastFour, color: a.color, balanceMinor, baseBalanceMinor });
  }

  const paidByLoan = new Map(loanPaid.map((p) => [p.loanId, Number(p.principal)]));
  const loanSummary = loans.map((l) => ({ id: l.id, name: l.name, direction: l.direction, currency: l.currency, principalMinor: l.principalMinor, outstandingMinor: Math.max(0, l.principalMinor - (paidByLoan.get(l.id) ?? 0)), paymentAmountMinor: l.paymentAmountMinor }));

  return {
    base,
    businessName: settings.businessName,
    range,
    totals,
    prevTotals,
    cashflow,
    expenseCats: expenseCats.slice(0, 6),
    incomeCats: incomeCats.slice(0, 5),
    accounts: accountCards,
    totalBaseMinor,
    recent: recent.map((t) => ({ id: t.id, date: t.date, description: t.description, merchant: t.merchant, amountMinor: t.amountMinor, currency: t.currency, baseAmountMinor: t.baseAmountMinor, type: t.type, categoryName: t.category?.name ?? null, categoryColor: t.category?.color ?? null, accountName: t.account.name })),
    upcoming: upcoming.map((r) => ({ id: r.id, name: r.name, amountMinor: r.amountMinor, currency: r.currency, nextDueDate: r.nextDueDate, categoryColor: r.category?.color ?? null, frequency: r.frequency })),
    overdue: overdue.map((r) => ({ id: r.id, name: r.name, amountMinor: r.amountMinor, currency: r.currency, nextDueDate: r.nextDueDate, categoryColor: r.category?.color ?? null, frequency: r.frequency })),
    loans: loanSummary,
    attention: { uncategorized: Number(uncategorized[0]?.n ?? 0), pendingReviews: Number(pendingReviews[0]?.n ?? 0), overdueRecurring: overdue.length },
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
