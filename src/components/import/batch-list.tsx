"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, FileSpreadsheet, Image as ImageIcon, Trash2, CheckCircle2, AlertTriangle, Clock, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { deleteBatch } from "@/lib/actions/import";
import type { BatchStats, Reconciliation, DetectedStatement } from "@/lib/db/schema";

type B = { id: string; fileName: string; fileType: string; status: string; stage: string; createdAt: string; accountName: string; currency: string; stats: BatchStats | null; reconciliation: Reconciliation | null; engine: string | null; error: string | null; detected: DetectedStatement | null };

export function BatchList({ batches, baseCurrency }: { batches: B[]; baseCurrency: string }) {
  const router = useRouter();
  const toast = useToast();
  const [del, setDel] = useState<B | null>(null);
  const [pending, start] = useTransition();
  if (batches.length === 0) return <div className="card"><EmptyState icon={<FileText className="h-5 w-5" />} title="No imports yet" description="Your imported statements will appear here with their verification results." /></div>;
  const icon = (t: string) => (t === "pdf" ? <FileText className="h-4 w-4 text-danger" /> : t === "image" ? <ImageIcon className="h-4 w-4 text-primary" /> : <FileSpreadsheet className="h-4 w-4 text-success" />);
  const statusBadge = (b: B) =>
    b.status === "COMMITTED" ? <Badge tone="green" dot>Committed</Badge>
    : b.status === "REVIEW" ? <Badge tone="blue" dot>Ready for review</Badge>
    : b.status === "FAILED" ? <Badge tone="red" dot>Failed</Badge>
    : <Badge tone="amber" dot>{b.stage}</Badge>;
  return (
    <div className="card overflow-hidden p-0">
      <div className="flex items-center justify-between px-5 py-4 sm:px-6">
        <h3 className="text-[16px] font-semibold">Import history</h3>
        <p className="text-[13px] text-muted">{batches.length} statement{batches.length === 1 ? "" : "s"}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="table min-w-[880px] whitespace-nowrap">
          <thead>
            <tr><th>Statement</th><th>Period</th><th>Rows</th><th>Money in</th><th>Money out</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {batches.map((b) => {
              const cur = b.detected?.currency ?? b.currency ?? baseCurrency;
              return (
                <tr key={b.id} className="cursor-pointer" onClick={() => (b.status === "REVIEW" || b.status === "COMMITTED") && router.push(`/import/${b.id}`)}>
                  <td>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2">{icon(b.fileType)}</span>
                      <div className="min-w-0">
                        <p className="max-w-[210px] truncate font-medium text-ink">{b.fileName}</p>
                        <p className="text-[12px] text-muted">{b.accountName} · {formatDate(b.createdAt, "d MMM yyyy")}</p>
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap text-ink-2">{b.detected?.periodStart ? `${formatDate(b.detected.periodStart, "d MMM yy")} – ${formatDate(b.detected.periodEnd ?? b.detected.periodStart, "d MMM yy")}` : "—"}</td>
                  <td className="tnum">{b.stats ? <>{b.stats.included}{b.stats.duplicates ? <span className="text-muted"> · {b.stats.duplicates} duplicate</span> : null}</> : "—"}</td>
                  <td className="tnum text-success">{b.stats ? formatMoney(b.stats.creditsMinor, cur) : "—"}</td>
                  <td className="tnum">{b.stats ? formatMoney(-b.stats.debitsMinor, cur) : "—"}</td>
                  <td>
                    {statusBadge(b)}
                    <div className="mt-1">
                    {b.reconciliation ? (
                      b.reconciliation.ok ? <span className="inline-flex items-center gap-1 text-[12px] text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Reconciled</span> : <span className="inline-flex items-center gap-1.5 text-[13px] text-warning"><AlertTriangle className="h-4 w-4" /> {b.reconciliation.checks.filter((c) => !c.ok).length} issue(s)</span>
                    ) : b.status === "FAILED" ? <span className="max-w-[220px] truncate text-[12px] text-danger" title={b.error ?? ""}>{b.error}</span> : <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">{b.status === "PROCESSING" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />} Pending</span>}
                    </div>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {b.status === "REVIEW" && <Link href={`/import/${b.id}`} className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-primary hover:bg-primary-50">Review</Link>}
                      <button onClick={() => setDel(b)} className="rounded-lg p-1.5 text-faint hover:bg-danger-50 hover:text-danger" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={Boolean(del)}
        onClose={() => setDel(null)}
        title={del?.status === "COMMITTED" ? "Delete import and its transactions?" : "Delete import?"}
        message={del?.status === "COMMITTED" ? `This removes the ${del.stats?.included ?? ""} transactions that were imported from ${del.fileName} from your ledger. This cannot be undone.` : `Remove ${del?.fileName} and its parsed rows. Nothing has been written to the ledger.`}
        loading={pending}
        onConfirm={() => start(async () => { await deleteBatch(del!.id, { deleteTransactions: del!.status === "COMMITTED" }); setDel(null); toast.success("Import deleted"); router.refresh(); })}
      />
    </div>
  );
}
