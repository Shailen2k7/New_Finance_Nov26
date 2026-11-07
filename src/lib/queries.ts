import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "./db";
import { cache } from "react";

export const listAccounts = cache(async (includeArchived = false) => {
  const db = await getDb();
  return db
    .select()
    .from(schema.accounts)
    .where(includeArchived ? undefined : eq(schema.accounts.isArchived, false))
    .orderBy(asc(schema.accounts.createdAt));
});

export const listCategories = cache(async () => {
  const db = await getDb();
  return db.select().from(schema.categories).orderBy(asc(schema.categories.type), asc(schema.categories.sortOrder), asc(schema.categories.name));
});

export type TxnFilters = {
  q?: string;
  type?: "INCOME" | "EXPENSE" | "TRANSFER";
  accountId?: string;
  categoryId?: string;
  from?: string;
  to?: string;
  min?: number; // in major units
  max?: number;
  uncategorized?: boolean;
  currency?: string;
  page?: number;
  pageSize?: number;
  sort?: "date_desc" | "date_asc" | "amount_desc" | "amount_asc";
};

export function buildTxnWhere(f: TxnFilters): SQL | undefined {
  const t = schema.transactions;
  const conds: (SQL | undefined)[] = [];
  if (f.q) {
    const like = `%${f.q.trim()}%`;
    conds.push(or(ilike(t.description, like), ilike(t.merchant, like), ilike(t.notes, like), ilike(t.reference, like)));
  }
  if (f.type) conds.push(eq(t.type, f.type));
  if (f.accountId) conds.push(eq(t.accountId, f.accountId));
  if (f.categoryId) conds.push(eq(t.categoryId, f.categoryId));
  if (f.uncategorized) conds.push(isNull(t.categoryId), ne(t.type, "TRANSFER"));
  if (f.from) conds.push(gte(t.date, f.from));
  if (f.to) conds.push(lte(t.date, f.to));
  if (f.currency) conds.push(eq(t.currency, f.currency));
  if (f.min !== undefined) conds.push(gte(sql`abs(${t.amountMinor})`, Math.round(f.min * 100)));
  if (f.max !== undefined) conds.push(lte(sql`abs(${t.amountMinor})`, Math.round(f.max * 100)));
  const valid = conds.filter((c): c is SQL => Boolean(c));
  return valid.length ? and(...valid) : undefined;
}

export async function getTransactions(f: TxnFilters) {
  const db = await getDb();
  const t = schema.transactions;
  const where = buildTxnWhere(f);
  const page = Math.max(1, f.page ?? 1);
  const pageSize = Math.min(500, Math.max(10, f.pageSize ?? 50));
  const order =
    f.sort === "date_asc" ? [asc(t.date), asc(t.createdAt)]
    : f.sort === "amount_desc" ? [desc(sql`abs(${t.amountMinor})`)]
    : f.sort === "amount_asc" ? [asc(sql`abs(${t.amountMinor})`)]
    : [desc(t.date), desc(t.createdAt)];

  const [rows, totals] = await Promise.all([
    db.query.transactions.findMany({
      where,
      with: { account: true, category: true },
      orderBy: order,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    db
      .select({
        count: sql<number>`count(*)::int`,
        income: sql<number>`coalesce(sum(case when ${t.type} = 'INCOME' then ${t.baseAmountMinor} else 0 end), 0)::bigint`,
        expense: sql<number>`coalesce(sum(case when ${t.type} = 'EXPENSE' then ${t.baseAmountMinor} else 0 end), 0)::bigint`,
        net: sql<number>`coalesce(sum(case when ${t.type} <> 'TRANSFER' then ${t.baseAmountMinor} else 0 end), 0)::bigint`,
      })
      .from(t)
      .where(where),
  ]);
  const s = totals[0];
  return {
    rows,
    total: Number(s?.count ?? 0),
    page,
    pageSize,
    sums: { incomeMinor: Number(s?.income ?? 0), expenseMinor: Number(s?.expense ?? 0), netMinor: Number(s?.net ?? 0) },
  };
}

export async function getTransactionsByIds(ids: string[]) {
  if (!ids.length) return [];
  const db = await getDb();
  return db.query.transactions.findMany({ where: inArray(schema.transactions.id, ids), with: { account: true, category: true } });
}

export type TxnWithRelations = Awaited<ReturnType<typeof getTransactions>>["rows"][number];
