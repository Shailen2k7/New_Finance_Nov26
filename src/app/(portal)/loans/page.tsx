import { Suspense } from "react";
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { listAccounts } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { LoansView } from "@/components/loans/loans-view";

export const dynamic = "force-dynamic";

export default async function LoansPage() {
  const db = await getDb();
  const [loans, accounts, settings] = await Promise.all([
    db.query.loans.findMany({ with: { payments: true }, orderBy: [desc(schema.loans.status), desc(schema.loans.createdAt)] }),
    listAccounts(),
    getSettings(),
  ]);
  return (
    <Suspense>
      <LoansView loans={loans} accounts={accounts} defaultCurrency={settings.baseCurrency} />
    </Suspense>
  );
}
