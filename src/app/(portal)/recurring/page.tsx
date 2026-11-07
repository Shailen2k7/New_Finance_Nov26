import { Suspense } from "react";
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { listAccounts, listCategories } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { todayISO } from "@/lib/dates";
import { RecurringView } from "@/components/recurring/recurring-view";

export const dynamic = "force-dynamic";

export default async function RecurringPage() {
  const db = await getDb();
  const [items, accounts, categories, settings] = await Promise.all([
    db.select().from(schema.recurringPayments).orderBy(asc(schema.recurringPayments.nextDueDate)),
    listAccounts(),
    listCategories(),
    getSettings(),
  ]);
  return (
    <Suspense>
      <RecurringView items={items} accounts={accounts} categories={categories} today={todayISO()} defaultCurrency={settings.baseCurrency} />
    </Suspense>
  );
}
