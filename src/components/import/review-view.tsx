"use client";
import { useMemo, useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, XCircle, AlertTriangle, Sparkles, Pencil, Loader2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select } from "@/components/ui/input";
import { ColorDot, Segmented } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { formatMoney, fromMinor } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { updateImportRow, setRowsInclude, setRowsCategory, commitBatch } from "@/lib/actions/import";
import type { BatchStats, Reconciliation, DetectedStatement } from "@/lib/db/schema";

type Row = { id: string; rowIndex: number; date: string | null; description: string; merchant: string | null; amountMinor: number | null; currency: string; balanceAfterMinor: number | null; reference: string | null; type: "INCOME" | "EXPENSE" | "TRANSFER"; categoryId: string | null; confidence: number; flags: string[]; isDuplicate: boolean; include: boolean; source: string | null; page: number | null };
type Cat = { id: string; name: string; type: "INCOME" | "EXPENSE"; color: string };
type Batch = { id: string; fileName: string; fileType: string; status: string; stage: string; progress: number; error: string | null; engine: string | null; detected: DetectedStatement | null; stats: BatchStats | null; reconciliation: Reconciliation | null; mapping: Record<string, unknown> | null; accountName: string; accountCurrency: string; createdAt: string; committedAt: string | null };

const FLAG_LABEL: Record<string, { label: string; tone: "gray" | "red" | "amber" | "blue" }> = {
  duplicate: { label: "Already imported", tone: "gray" },
  unparsed_date: { label: "Date needs fixing", tone: "red" },
  unparsed_amount: { label: "Amount needs fixing", tone: "red" },
  unverified_amount: { label: "Amount not found in PDF text", tone: "amber" },
  balance_break: { label: "Balance break", tone: "amber" },
  low_confidence: { label: "Check category", tone: "amber" },
  date_outside_period: { label: "Date outside period", tone: "amber" },
  heuristic_pdf: { label: "Unverified (no AI)", tone: "amber" },
  both_debit_and_credit: { label: "Debit and credit both set", tone: "amber" },
  direction_assumed: { label: "First row: direction assumed (no opening balance printed)", tone: "amber" },
};

type Filter = "all" | "flagged" | "duplicates" | "uncategorized" | "excluded" | "transfers";

export function ReviewView({ batch, rows: initialRows, categories, baseCurrency }: { batch: Batch; rows: Row[]; categories: Cat[]; baseCurrency: string }) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState(initialRows);
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Row | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const [bulkCat, setBulkCat] = useState("");
  useEffect(() => setRows(initialRows), [initialRows]);

  // Poll while still processing
  useEffect(() => {
    if (batch.status !== "PROCESSING" && batch.status !== "UPLOADED") return;
    const t = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(t);
  }, [batch.status, router]);

  const committed = batch.status === "COMMITTED";
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const currency = batch.detected?.currency ?? batch.accountCurrency ?? baseCurrency;
  const visible = useMemo(() => rows.filter((r) =>
    filter === "all" ? true
    : filter === "flagged" ? r.flags.some((f) => f !== "duplicate")
    : filter === "duplicates" ? r.isDuplicate
    : filter === "uncategorized" ? !r.categoryId && r.type !== "TRANSFER"
    : filter === "excluded" ? !r.include
    : r.type === "TRANSFER"), [rows, filter]);

  const toImport = rows.filter((r) => r.include && !r.isDuplicate && r.date && r.amountMinor !== null);
  const inMinor = toImport.filter((r) => r.amountMinor! > 0).reduce((a, r) => a + r.amountMinor!, 0);
  const outMinor = toImport.filter((r) => r.amountMinor! < 0).reduce((a, r) => a + Math.abs(r.amountMinor!), 0);
  const blocking = rows.filter((r) => r.include && !r.isDuplicate && (!r.date || r.amountMinor === null)).length;
  const counts = { flagged: rows.filter((r) => r.flags.some((f) => f !== "duplicate")).length, duplicates: rows.filter((r) => r.isDuplicate).length, uncategorized: rows.filter((r) => !r.categoryId && r.type !== "TRANSFER").length, excluded: rows.filter((r) => !r.include).length, transfers: rows.filter((r) => r.type === "TRANSFER").length };

  const patchLocal = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const changeCategory = (row: Row, categoryId: string) => {
    const cat = categoryId ? catById.get(categoryId) : null;
    patchLocal(row.id, { categoryId: categoryId || null, confidence: 1, flags: row.flags.filter((f) => f !== "low_confidence"), type: cat ? cat.type : row.type });
    start(async () => {
      await updateImportRow(row.id, { categoryId: categoryId || null, ...(cat ? { type: cat.type } : {}) });
    });
  };
  const toggleInclude = (row: Row) => {
    patchLocal(row.id, { include: !row.include });
    start(async () => { await setRowsInclude(batch.id, [row.id], !row.include); });
  };
  const bulkInclude = (include: boolean) => {
    const ids = [...selected];
    setRows((rs) => rs.map((r) => (selected.has(r.id) ? { ...r, include } : r)));
    start(async () => { await setRowsInclude(batch.id, ids, include); setSelected(new Set()); });
  };
  const bulkCategory = (categoryId: string) => {
    const ids = [...selected];
    const cat = catById.get(categoryId);
    setRows((rs) => rs.map((r) => (selected.has(r.id) ? { ...r, categoryId, confidence: 1, type: cat?.type ?? r.type, flags: r.flags.filter((f) => f !== "low_confidence") } : r)));
    start(async () => { await setRowsCategory(batch.id, ids, categoryId); setSelected(new Set()); setBulkCat(""); });
  };
  const doCommit = () => start(async () => {
    try {
      const res = await commitBatch(batch.id);
      toast.success(`${res.inserted} transactions added to the ledger`, res.skipped ? `${res.skipped} skipped as already present` : undefined);
      setConfirm(false);
      const from = batch.detected?.periodStart, to = batch.detected?.periodEnd;
      router.push(from && to ? `/transactions?from=${from}&to=${to}` : "/transactions");
    } catch (e) {
      toast.error("Commit failed", (e as Error).message);
    }
  });

  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));
  const confidenceBadge = (r: Row) => r.isDuplicate ? null : r.confidence >= 0.9 ? <Badge tone="green">High</Badge> : r.confidence >= 0.6 ? <Badge tone="blue">Medium</Badge> : <Badge tone="amber">Low</Badge>;

  if (batch.status === "PROCESSING" || batch.status === "UPLOADED" || batch.status === "FAILED") {
    return (
      <div className="mx-auto max-w-2xl">
        <Link href="/import" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Back to imports</Link>
        <div className="card p-8 text-center">
          {batch.status === "FAILED" ? <XCircle className="mx-auto h-10 w-10 text-danger" /> : <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />}
          <p className="mt-4 text-[16px] font-semibold">{batch.status === "FAILED" ? "Import failed" : batch.stage}</p>
          <p className="mt-1 text-[13px] text-muted">{batch.status === "FAILED" ? batch.error : batch.fileName}</p>
          {batch.status === "FAILED" && <Button className="mt-5" onClick={async () => { await fetch(`/api/import/batches/${batch.id}/retry`, { method: "POST" }); router.refresh(); }}>Retry</Button>}
        </div>
      </div>
    );
  }

  const d = batch.detected;
  const recon = batch.reconciliation;
  const notes = (batch.mapping?.notes as string[] | undefined) ?? [];

  return (
    <div className="mx-auto max-w-[1500px] pb-28">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-full">
          <Link href="/import" className="mb-2 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Back to imports</Link>
          <h1 className="flex flex-wrap items-center gap-2 break-all text-[20px] font-semibold tracking-tight sm:text-[22px]">{batch.fileName}
            {batch.engine === "ai" ? <Badge tone="blue"><Sparkles className="h-3 w-3" /> AI parsed</Badge> : <Badge tone="gray">Deterministic</Badge>}
            {committed && <Badge tone="green" dot>Committed {formatDate(batch.committedAt ?? "", "d MMM yyyy")}</Badge>}
          </h1>
          <p className="mt-1 text-[13px] text-muted">Into <span className="font-medium text-ink-2">{batch.accountName}</span>{d?.bank ? ` · ${d.bank}` : ""}{d?.accountNumberMasked ? ` · ${d.accountNumberMasked}` : ""}{d?.accountHolder ? ` · ${d.accountHolder}` : ""}</p>
        </div>
        {!committed && <Button size="lg" onClick={() => setConfirm(true)} disabled={toImport.length === 0 || blocking > 0}><CheckCircle2 className="h-4 w-4" /> Commit {toImport.length} transactions</Button>}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="card p-5">
          <h3 className="text-[16px] font-semibold">Verification</h3>
          <p className="mt-0.5 text-[12px] text-muted">Every check must pass for a fully reconciled import. Failed checks point at the rows to look at.</p>
          <ul className="mt-4 space-y-2.5">
            {(recon?.checks ?? []).map((c) => (
              <li key={c.name} className="flex items-start gap-3">
                {c.ok ? <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-success" /> : <AlertTriangle className="mt-0.5 h-[18px] w-[18px] shrink-0 text-warning" />}
                <div>
                  <p className="text-[14px] text-ink">{c.name}</p>
                  <p className={cn("text-[12px]", c.ok ? "text-muted" : "text-warning")}>{c.detail}</p>
                </div>
              </li>
            ))}
            {notes.map((n, i) => (
              <li key={i} className="flex items-start gap-3"><Info className="mt-0.5 h-[18px] w-[18px] shrink-0 text-primary" /><p className="text-[12px] text-muted">{n}</p></li>
            ))}
          </ul>
        </div>
        <div className="grid grid-cols-2 content-start gap-3">
          <Stat label="Statement period" value={d?.periodStart ? `${formatDate(d.periodStart, "d MMM yy")} – ${formatDate(d.periodEnd ?? d.periodStart, "d MMM yy")}` : "—"} />
          <Stat label="Opening balance" value={typeof d?.openingBalanceMinor === "number" ? formatMoney(d.openingBalanceMinor, currency) : "—"} />
          <Stat label="Closing balance" value={typeof d?.closingBalanceMinor === "number" ? formatMoney(d.closingBalanceMinor, currency) : "—"} sub={typeof recon?.computedClosingMinor === "number" ? `computed ${formatMoney(recon.computedClosingMinor, currency)}` : undefined} tone={recon?.diffMinor === 0 ? "ok" : recon?.diffMinor ? "warn" : undefined} />
          <Stat label="Rows parsed" value={String(rows.length)} sub={`${counts.duplicates} already imported`} />
          <Stat label="Money in" value={formatMoney(inMinor, currency)} tone="ok" />
          <Stat label="Money out" value={formatMoney(-outMinor, currency)} />
        </div>
      </div>

      <div className="card mt-4 overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
          <Segmented value={filter} onChange={setFilter} options={[
            { value: "all", label: `All (${rows.length})` },
            { value: "flagged", label: `Flagged (${counts.flagged})` },
            ...(committed ? [] : [{ value: "uncategorized" as const, label: `Uncategorized (${counts.uncategorized})` }]),
            { value: "transfers", label: `Transfers (${counts.transfers})` },
            { value: "duplicates", label: `Duplicates (${counts.duplicates})` },
            { value: "excluded", label: `Excluded (${counts.excluded})` },
          ]} />
          <div className="ml-auto flex items-center gap-2">
            {selected.size > 0 && !committed && (
              <>
                <span className="text-[13px] text-muted">{selected.size} selected</span>
                <Select value={bulkCat} onChange={(e) => e.target.value && bulkCategory(e.target.value)} className="h-9 w-[220px] py-1.5">
                  <option value="">Set category…</option>
                  <optgroup label="Income">{categories.filter((c) => c.type === "INCOME").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
                  <optgroup label="Expense">{categories.filter((c) => c.type === "EXPENSE").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
                </Select>
                <Button size="sm" variant="outline" onClick={() => bulkInclude(true)}>Include</Button>
                <Button size="sm" variant="outline" onClick={() => bulkInclude(false)}>Exclude</Button>
              </>
            )}
            {pending && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
          </div>
          {committed && <p className="w-full text-[12px] text-muted">This is the statement as it was imported. Change categories in the Transactions tab.</p>}
        </div>
        <div className="max-h-[70vh] overflow-auto">
          <table className={cn("table", committed ? "min-w-[720px]" : "min-w-[880px]")}>
            <thead>
              <tr>
                {!committed && <th className="w-10"><input type="checkbox" checked={allVisibleSelected} onChange={() => setSelected(allVisibleSelected ? new Set() : new Set(visible.map((r) => r.id)))} /></th>}
                {!committed && <th className="w-10">In</th>}
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th className="!text-right">Amount</th>
                <th className="!text-right max-[1399px]:hidden">Balance</th>
                <th>Check</th>
                {!committed && <th></th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className={cn(!r.include || r.isDuplicate ? "opacity-50" : "", r.flags.includes("unparsed_date") || r.flags.includes("unparsed_amount") ? "bg-danger-50/40" : "")}>
                  {!committed && <td><input type="checkbox" checked={selected.has(r.id)} onChange={() => setSelected((s) => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n; })} /></td>}
                  {!committed && <td><input type="checkbox" checked={r.include && !r.isDuplicate} disabled={r.isDuplicate} onChange={() => toggleInclude(r)} /></td>}
                  <td className="whitespace-nowrap tnum">{r.date ? formatDate(r.date) : <span className="text-danger">—</span>}</td>
                  <td>
                    <p className="max-w-[220px] truncate font-medium text-ink" title={r.description}>{r.merchant || r.description}</p>
                    {r.merchant && <p className="max-w-[220px] truncate text-[12px] text-muted" title={r.description}>{r.description}</p>}
                  </td>
                  <td>
                    {r.type === "TRANSFER" ? <Badge tone="purple">Transfer</Badge> : (
                      <div className="flex items-center gap-2">
                        {r.categoryId && <ColorDot color={catById.get(r.categoryId)?.color ?? "#999"} />}
                        <select value={r.categoryId ?? ""} disabled={committed} onChange={(e) => changeCategory(r, e.target.value)} className={cn("h-8 w-[160px] rounded-lg border bg-surface px-2 text-[13px]", r.categoryId ? "border-line" : "border-warning text-warning")}>
                          <option value="">Uncategorized</option>
                          <optgroup label="Income">{categories.filter((c) => c.type === "INCOME").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
                          <optgroup label="Expense">{categories.filter((c) => c.type === "EXPENSE").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
                        </select>
                      </div>
                    )}
                  </td>
                  <td className={cn("whitespace-nowrap text-right tnum font-medium", (r.amountMinor ?? 0) > 0 ? "text-success" : "text-ink")}>{r.amountMinor === null ? <span className="text-danger">—</span> : formatMoney(r.amountMinor, r.currency, { signed: true })}</td>
                  <td className="whitespace-nowrap text-right tnum text-muted max-[1399px]:hidden">{typeof r.balanceAfterMinor === "number" ? formatMoney(r.balanceAfterMinor, r.currency) : ""}</td>
                  <td>
                    <div className="flex gap-1 whitespace-nowrap">
                      {!committed && confidenceBadge(r)}
                      {r.flags.map((f) => FLAG_LABEL[f] ? <Badge key={f} tone={FLAG_LABEL[f].tone}>{FLAG_LABEL[f].label}</Badge> : f.length > 24 ? <p key={f} className="w-[170px] whitespace-normal text-[11px] leading-snug text-warning">{f}</p> : <Badge key={f} tone="gray">{f}</Badge>)}
                    </div>
                  </td>
                  {!committed && <td><button onClick={() => setEditing(r)} className="rounded-lg p-1.5 text-faint hover:bg-surface-2 hover:text-ink" aria-label="Edit"><Pencil className="h-4 w-4" /></button></td>}
                </tr>
              ))}
              {visible.length === 0 && <tr><td colSpan={committed ? 6 : 9} className="py-10 text-center text-muted">Nothing here.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {!committed && (
        <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 z-20 border-t border-line bg-surface/95 px-5 py-3 backdrop-blur lg:bottom-3 lg:left-[256px] lg:right-3 lg:rounded-b-2xl">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3">
            <div className="text-[13px] text-muted">
              <span className="font-medium text-ink">{toImport.length}</span> transactions will be added · in <span className="tnum text-success">{formatMoney(inMinor, currency)}</span> · out <span className="tnum text-ink">{formatMoney(-outMinor, currency)}</span>
              {counts.duplicates > 0 && <> · {counts.duplicates} skipped as already imported</>}
              {blocking > 0 && <span className="text-danger"> · fix {blocking} row(s) with a missing date or amount, or exclude them</span>}
            </div>
            <Button onClick={() => setConfirm(true)} disabled={toImport.length === 0 || blocking > 0}><CheckCircle2 className="h-4 w-4" /> Commit to ledger</Button>
          </div>
        </div>
      )}

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Commit to ledger" size="sm" footer={<><Button variant="outline" onClick={() => setConfirm(false)}>Cancel</Button><Button onClick={doCommit} loading={pending}>Commit {toImport.length} transactions</Button></>}>
        <div className="space-y-3 text-[14px]">
          <p>Adds <strong>{toImport.length}</strong> transactions to <strong>{batch.accountName}</strong>: {formatMoney(inMinor, currency)} in, {formatMoney(outMinor, currency)} out.</p>
          {recon && !recon.ok && <div className="rounded-xl border border-warning/30 bg-warning-50 p-3 text-[13px] text-warning"><AlertTriangle className="mr-1 inline h-4 w-4" /> Not every verification check passed. You can still commit, but the flagged rows deserve a second look.</div>}
          {counts.uncategorized > 0 && <p className="text-[13px] text-muted">{counts.uncategorized} transaction(s) are uncategorized — you can categorize them later from Transactions.</p>}
        </div>
      </Modal>

      {editing && <RowEditor row={editing} categories={categories} onClose={() => setEditing(null)} onSaved={(patch) => { patchLocal(editing.id, patch); setEditing(null); router.refresh(); }} />}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "ok" | "warn" }) {
  return (
    <div className="card min-w-0 p-4">
      <p className="truncate text-[12px] text-muted">{label}</p>
      <p className={cn("tnum mt-1 text-[15px] font-semibold sm:text-[16px]", tone === "ok" ? "text-success" : tone === "warn" ? "text-warning" : "text-ink")}>{value}</p>
      {sub && <p className="text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

function RowEditor({ row, categories, onClose, onSaved }: { row: Row; categories: Cat[]; onClose: () => void; onSaved: (patch: Partial<Row>) => void }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(row.date ?? "");
  const [description, setDescription] = useState(row.description);
  const [merchant, setMerchant] = useState(row.merchant ?? "");
  const [amount, setAmount] = useState(row.amountMinor === null ? "" : String(Math.abs(fromMinor(row.amountMinor))));
  const [flow, setFlow] = useState<"IN" | "OUT">((row.amountMinor ?? 0) >= 0 ? "IN" : "OUT");
  const [type, setType] = useState<Row["type"]>(row.type);
  const [categoryId, setCategoryId] = useState(row.categoryId ?? "");
  const [currency, setCurrency] = useState(row.currency);
  const save = () => start(async () => {
    const n = Number(amount);
    if (!date || !Number.isFinite(n) || n <= 0) return toast.error("Enter a valid date and amount");
    const signed = flow === "IN" ? n : -n;
    const t: Row["type"] = type === "TRANSFER" ? "TRANSFER" : signed > 0 ? "INCOME" : "EXPENSE";
    try {
      await updateImportRow(row.id, { date, description, merchant: merchant || null, amount: signed, type: t, categoryId: t === "TRANSFER" ? null : categoryId || null, currency });
      onSaved({ date, description, merchant: merchant || null, amountMinor: Math.round(signed * 100), type: t, categoryId: t === "TRANSFER" ? null : categoryId || null, currency, confidence: 1, flags: row.flags.filter((f) => !["unparsed_date", "unparsed_amount", "low_confidence", "unverified_amount"].includes(f)) });
      toast.success("Row updated");
    } catch (e) {
      toast.error("Could not save", (e as Error).message);
    }
  });
  return (
    <Modal open onClose={onClose} title="Edit transaction" description={`Row ${row.rowIndex + 1}${row.page ? ` · page ${row.page}` : ""}`} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} loading={pending}>Save</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Direction"><Segmented value={flow} onChange={setFlow} options={[{ value: "IN", label: "Money in" }, { value: "OUT", label: "Money out" }]} /></Field>
        <Field label="Amount"><Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Currency"><Input value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} /></Field>
        <Field label="Description" className="sm:col-span-2"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field label="Merchant"><Input value={merchant} onChange={(e) => setMerchant(e.target.value)} /></Field>
        <Field label="Kind">
          <Select value={type === "TRANSFER" ? "TRANSFER" : "NORMAL"} onChange={(e) => setType(e.target.value === "TRANSFER" ? "TRANSFER" : flow === "IN" ? "INCOME" : "EXPENSE")}>
            <option value="NORMAL">Income / Expense</option>
            <option value="TRANSFER">Transfer between own accounts</option>
          </Select>
        </Field>
        {type !== "TRANSFER" && (
          <Field label="Category" className="sm:col-span-2">
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Uncategorized</option>
              {categories.filter((c) => c.type === (flow === "IN" ? "INCOME" : "EXPENSE")).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        )}
      </div>
    </Modal>
  );
}
