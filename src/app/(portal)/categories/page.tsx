import { ne, sql, and } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { listCategories } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { PageTabs } from "@/components/layout/page-tabs";
import { CategoriesView } from "@/components/categories/categories-view";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const [db, categories, settings] = await Promise.all([getDb(), listCategories(), getSettings()]);
  const t = schema.transactions;
  const stats = await db
    .select({
      categoryId: t.categoryId,
      count: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${t.baseAmountMinor}), 0)::bigint`,
    })
    .from(t)
    .where(and(ne(t.type, "TRANSFER"), sql`${t.categoryId} is not null`))
    .groupBy(t.categoryId);
  const byId = new Map(stats.map((s) => [s.categoryId, { count: Number(s.count), totalMinor: Number(s.total) }]));
  const [uncat] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(t)
    .where(and(ne(t.type, "TRANSFER"), sql`${t.categoryId} is null`));
  const rows = categories.map((c) => ({ ...c, count: byId.get(c.id)?.count ?? 0, totalMinor: byId.get(c.id)?.totalMinor ?? 0 }));
  return (
    <div>
      <PageTabs group="settings" />
      <CategoriesView categories={rows} baseCurrency={settings.baseCurrency} uncategorizedCount={Number(uncat?.count ?? 0)} />
    </div>
  );
}
