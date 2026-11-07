import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getTransactions, listAccounts, listCategories, buildTxnWhere } from "@/lib/queries";
import { formatMoney } from "@/lib/money";
import { StatTile, PageHeader } from "@/components/ui/misc";
import { PageTabs } from "@/components/layout/page-tabs";
import { TransactionsTable } from "./transactions-table";
import { parseFilters, type Preset, type SP } from "./params";

const TITLES: Record<Preset, { title: string; description: string }> = {
  ALL: { title: "Transactions", description: "Every movement of money across your accounts, in one ledger." },
  INCOME: { title: "Income", description: "Client fees, retainers and everything else coming in." },
  EXPENSE: { title: "Expenses", description: "Everything going out, categorized so you always know where it went." },
};

async function topCategory(filters: ReturnType<typeof parseFilters>) {
  const db = await getDb();
  const where = buildTxnWhere(filters);
  const t = schema.transactions;
  const rows = await db
    .select({ categoryId: t.categoryId, total: sql<number>`coalesce(sum(abs(${t.baseAmountMinor})), 0)::bigint` })
    .from(t)
    .where(where)
    .groupBy(t.categoryId)
    .orderBy(desc(sql`sum(abs(${t.baseAmountMinor}))`))
    .limit(3);
  const top = rows.find((r) => r.categoryId) ?? rows[0];
  if (!top) return null;
  if (!top.categoryId) return { name: "Uncategorized", totalMinor: Number(top.total) };
  const cat = await db.query.categories.findFirst({ where: eq(schema.categories.id, top.categoryId) });
  return { name: cat?.name ?? "Uncategorized", totalMinor: Number(top.total) };
}

export async function TransactionsPage({ searchParams, preset }: { searchParams: Promise<SP>; preset: Preset }) {
  const sp = await searchParams;
  const filters = parseFilters(sp, preset);
  const [settings, accounts, categories, data, top] = await Promise.all([
    getSettings(),
    listAccounts(),
    listCategories(),
    getTransactions(filters),
    preset === "ALL" ? Promise.resolve(null) : topCategory(filters),
  ]);
  const base = settings.baseCurrency;
  const meta = TITLES[preset];
  const totalFlow = preset === "INCOME" ? data.sums.incomeMinor : Math.abs(data.sums.expenseMinor);
  const avg = data.total ? Math.round(totalFlow / data.total) : 0;

  return (
    <div className="fade-up">
      <PageTabs group={preset === "ALL" ? "transactions" : "money"} />
      <PageHeader title={meta.title} description={meta.description} />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {preset === "ALL" ? (
          <>
            <StatTile label="Income" value={formatMoney(data.sums.incomeMinor, base)} tone="up" sub="Money in" />
            <StatTile label="Expenses" value={formatMoney(Math.abs(data.sums.expenseMinor), base)} tone="down" sub="Money out" />
            <StatTile label="Net" value={formatMoney(data.sums.netMinor, base)} tone={data.sums.netMinor >= 0 ? "up" : "down"} sub={data.sums.netMinor >= 0 ? "Positive cash flow" : "Negative cash flow"} />
            <StatTile label="Transactions" value={data.total.toLocaleString("en-US")} sub={`Shown in ${base}`} />
          </>
        ) : (
          <>
            <StatTile label={preset === "INCOME" ? "Total income" : "Total spend"} value={formatMoney(totalFlow, base)} tone={preset === "INCOME" ? "up" : "down"} sub="For the selected filters" />
            <StatTile label="Transactions" value={data.total.toLocaleString("en-US")} sub="Matching your filters" />
            <StatTile label="Average" value={formatMoney(avg, base)} sub="Per transaction" />
            <StatTile text label="Top category" value={top ? top.name : "—"} sub={top ? formatMoney(top.totalMinor, base) : "No data yet"} />
          </>
        )}
      </div>
      <TransactionsTable
        rows={data.rows}
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        accounts={accounts}
        categories={categories}
        baseCurrency={base}
        preset={preset}
      />
    </div>
  );
}
