"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, FileText, FileSpreadsheet, Image as ImageIcon, CheckCircle2, AlertTriangle, Sparkles, Loader2, XCircle } from "lucide-react";
import { Select, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import Link from "next/link";

type Acct = { id: string; name: string; currency: string; lastFour: string | null; institution: string | null };
type Job = { batchId: string; fileName: string; status: string; stage: string; progress: number; error?: string | null };

export function UploadCard({ accounts, aiReady, directUpload, supabaseUrl, supabaseAnon }: { accounts: Acct[]; aiReady: boolean; directUpload: boolean; supabaseUrl: string | null; supabaseAnon: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [drag, setDrag] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollers = useRef<Record<string, number>>({});

  const poll = useCallback(
    (batchId: string) => {
      const tick = async () => {
        try {
          const r = await fetch(`/api/import/batches/${batchId}`, { cache: "no-store" });
          if (!r.ok) return;
          const b = (await r.json()) as Job & { id: string };
          setJobs((js) => js.map((j) => (j.batchId === batchId ? { ...j, status: b.status, stage: b.stage, progress: b.progress, error: b.error } : j)));
          if (b.status === "REVIEW") {
            window.clearInterval(pollers.current[batchId]);
            toast.success("Statement parsed", "Review the transactions before committing.");
            router.push(`/import/${batchId}`);
          } else if (b.status === "FAILED" || b.status === "COMMITTED") {
            window.clearInterval(pollers.current[batchId]);
            router.refresh();
          }
        } catch {
          /* retry on next tick */
        }
      };
      pollers.current[batchId] = window.setInterval(tick, 1500);
      tick();
    },
    [router, toast],
  );

  useEffect(() => () => Object.values(pollers.current).forEach((id) => window.clearInterval(id)), []);

  const upload = async (files: FileList | File[]) => {
    if (!accountId) return toast.error("Choose an account first");
    for (const file of Array.from(files)) {
      const temp = `tmp-${Date.now()}-${Math.random()}`;
      setJobs((js) => [{ batchId: temp, fileName: file.name, status: "UPLOADING", stage: "Uploading", progress: 2 }, ...js]);
      try {
        let batchId: string;
        const signRes = await fetch("/api/import/sign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileName: file.name }) });
        const sign = (await signRes.json()) as { direct: boolean; path?: string; token?: string; bucket?: string; error?: string };
        if (sign.error) throw new Error(sign.error);
        if (sign.direct && directUpload && supabaseUrl && supabaseAnon) {
          const { createClient } = await import("@supabase/supabase-js");
          const sb = createClient(supabaseUrl, supabaseAnon);
          const { error } = await sb.storage.from(sign.bucket!).uploadToSignedUrl(sign.path!, sign.token!, file, { contentType: file.type || "application/octet-stream" });
          if (error) throw new Error(`Upload failed: ${error.message}`);
          const start = await fetch("/api/import/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: sign.path, fileName: file.name, accountId }) });
          const j = (await start.json()) as { batchId?: string; error?: string };
          if (!j.batchId) throw new Error(j.error ?? "Could not start import");
          batchId = j.batchId;
        } else {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("accountId", accountId);
          const r = await fetch("/api/import/upload", { method: "POST", body: fd });
          const j = (await r.json()) as { batchId?: string; error?: string };
          if (!j.batchId) throw new Error(j.error ?? "Upload failed");
          batchId = j.batchId;
        }
        setJobs((js) => js.map((x) => (x.batchId === temp ? { ...x, batchId, status: "PROCESSING", stage: "Queued", progress: 5 } : x)));
        poll(batchId);
      } catch (e) {
        setJobs((js) => js.map((x) => (x.batchId === temp ? { ...x, status: "FAILED", stage: "Failed", error: (e as Error).message } : x)));
        toast.error("Import failed", (e as Error).message);
      }
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (e.dataTransfer.files?.length) upload(e.dataTransfer.files);
  };

  return (
    <div className="card p-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={cn("flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition", drag ? "border-primary bg-primary-50" : "border-line-strong bg-surface-2 hover:border-primary/60 hover:bg-primary-50/40")}
          >
            <input ref={inputRef} type="file" multiple accept=".pdf,.csv,.tsv,.txt,.xlsx,.xls,.xlsm,.png,.jpg,.jpeg,.webp" className="hidden" onChange={(e) => e.target.files && upload(e.target.files)} />
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-sm"><FileUp className="h-6 w-6" /></span>
            <p className="text-[16px] font-semibold text-ink">Drop statements here, or click to browse</p>
            <p className="mt-1 text-[13px] text-muted">PDF, CSV, Excel, or a photo/screenshot of a statement · up to 40 MB each · several files at once</p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[12px] text-muted">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 shadow-sm"><FileText className="h-3.5 w-3.5 text-danger" /> PDF</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 shadow-sm"><FileSpreadsheet className="h-3.5 w-3.5 text-success" /> CSV / Excel</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 shadow-sm"><ImageIcon className="h-3.5 w-3.5 text-primary" /> PNG / JPG</span>
            </div>
          </div>
          {jobs.length > 0 && (
            <div className="mt-4 space-y-2">
              {jobs.map((j) => (
                <div key={j.batchId} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
                  {j.status === "FAILED" ? <XCircle className="h-5 w-5 text-danger" /> : j.status === "REVIEW" ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-[14px] font-medium text-ink">{j.fileName}</p>
                      <p className={cn("text-[12px]", j.status === "FAILED" ? "text-danger" : "text-muted")}>{j.status === "FAILED" ? j.error : j.stage}</p>
                    </div>
                    {j.status !== "FAILED" && <ProgressBar value={j.progress} className="mt-2 h-1.5" />}
                    {j.status === "FAILED" && !j.batchId.startsWith("tmp-") && (
                      <button className="mt-1 text-[12px] text-primary" onClick={async () => { await fetch(`/api/import/batches/${j.batchId}/retry`, { method: "POST" }); setJobs((js) => js.map((x) => (x.batchId === j.batchId ? { ...x, status: "PROCESSING", stage: "Queued", progress: 5, error: null } : x))); poll(j.batchId); }}>Retry</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-4">
          <Field label="Import into account" hint="The statement's currency is detected automatically; the account sets the default.">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}{a.lastFour ? ` ••••${a.lastFour}` : ""} · {a.currency}</option>
              ))}
            </Select>
          </Field>
          {accounts.length === 0 && <p className="text-[13px] text-danger">Create an account first under Settings → Accounts.</p>}
          <div className={cn("rounded-xl border p-4", aiReady ? "border-primary/20 bg-primary-50/60" : "border-warning/30 bg-warning-50")}>
            <div className="flex items-start gap-3">
              {aiReady ? <Sparkles className="mt-0.5 h-4 w-4 text-primary" /> : <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />}
              <div className="text-[13px] leading-5">
                {aiReady ? (
                  <>
                    <p className="font-medium text-ink">AI parsing is on</p>
                    <p className="text-muted">Every statement is read in full, then verified: opening + transactions must equal closing, running balances must chain, and each amount is cross-checked against the document text. Anything that does not add up is flagged — nothing is written until you commit.</p>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-ink">AI parsing is off</p>
                    <p className="text-muted">ICICI PDFs, CSV and Excel files import without AI. Other banks' PDFs and images need an Anthropic API key. <Link href="/settings" className="text-primary">Add it in Settings →</Link></p>
                  </>
                )}
              </div>
            </div>
          </div>
          <ul className="space-y-1.5 text-[12px] text-muted">
            <li>• Re-importing the same statement never duplicates transactions.</li>
            <li>• Categories you correct are remembered for future imports.</li>
            <li>• Transfers between your own accounts are kept out of income and expenses.</li>
          </ul>
          <Button variant="outline" className="w-full" onClick={() => inputRef.current?.click()}><FileUp className="h-4 w-4" /> Choose files</Button>
        </div>
      </div>
    </div>
  );
}
