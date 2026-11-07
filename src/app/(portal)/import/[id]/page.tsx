import { notFound } from "next/navigation";
import { getBatch, getBatchRows } from "@/lib/import/batches";
import { listCategories } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { ReviewView } from "@/components/import/review-view";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [batch, rows, categories, settings] = await Promise.all([getBatch(id), getBatchRows(id), listCategories(), getSettings()]);
  if (!batch) notFound();
  return (
    <ReviewView
      batch={{ id: batch.id, fileName: batch.fileName, fileType: batch.fileType, status: batch.status, stage: batch.stage, progress: batch.progress, error: batch.error, engine: batch.engine, detected: batch.detected, stats: batch.stats, reconciliation: batch.reconciliation, mapping: batch.mapping, accountName: batch.account.name, accountCurrency: batch.account.currency, createdAt: batch.createdAt.toISOString(), committedAt: batch.committedAt?.toISOString() ?? null }}
      rows={rows.map((r) => ({ id: r.id, rowIndex: r.rowIndex, date: r.date, description: r.description, merchant: r.merchant, amountMinor: r.amountMinor, currency: r.currency, balanceAfterMinor: r.balanceAfterMinor, reference: r.reference, type: r.type, categoryId: r.categoryId, confidence: r.confidence, flags: r.flags, isDuplicate: r.isDuplicate, include: r.include, source: (r.raw?.source as string | null) ?? null, page: (r.raw?.page as number | null) ?? null }))}
      categories={categories.map((c) => ({ id: c.id, name: c.name, type: c.type, color: c.color }))}
      baseCurrency={settings.baseCurrency}
    />
  );
}
