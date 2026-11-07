import { listAccounts } from "@/lib/queries";
import { listBatches } from "@/lib/import/batches";
import { getAnthropicKey, getSettings } from "@/lib/settings";
import { hasSupabaseStorage } from "@/lib/storage";
import { PageHeader } from "@/components/ui/misc";
import { PageTabs } from "@/components/layout/page-tabs";
import { UploadCard } from "@/components/import/upload-card";
import { BatchList } from "@/components/import/batch-list";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const [accounts, batches, key, settings] = await Promise.all([listAccounts(), listBatches(), getAnthropicKey(), getSettings()]);
  return (
    <div>
      <PageTabs group="transactions" />
      <PageHeader title="Import Statements" description="Drop a bank or card statement. It is read, verified against the statement balances, categorized and queued for your review before anything touches the ledger." />
      <UploadCard accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency, lastFour: a.lastFour, institution: a.institution }))} aiReady={Boolean(key)} directUpload={hasSupabaseStorage()} supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL ?? null} supabaseAnon={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null} />
      <div className="mt-6">
        <BatchList batches={batches.map((b) => ({ id: b.id, fileName: b.fileName, fileType: b.fileType, status: b.status, stage: b.stage, createdAt: b.createdAt.toISOString(), accountName: b.account.name, currency: b.account.currency, stats: b.stats, reconciliation: b.reconciliation, engine: b.engine, error: b.error, detected: b.detected }))} baseCurrency={settings.baseCurrency} />
      </div>
    </div>
  );
}
