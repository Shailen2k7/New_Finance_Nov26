"use server";
import { z } from "zod";
import { eq, and, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "../db";
import { reconcile } from "../import/reconcile";
import { fingerprintBase, fingerprintWithIndex } from "../fingerprint";
import { commitBatchCore } from "../import/commit";
import { recordAudit } from "../audit";
import { deleteFile } from "../storage";
import type { ParsedTxn } from "../import/types";
import type { BatchStats } from "../db/schema";

const RowPatch = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().min(1).optional(),
  merchant: z.string().nullable().optional(),
  amount: z.number().optional(), // signed, major units
  categoryId: z.string().uuid().nullable().optional(),
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]).optional(),
  include: z.boolean().optional(),
  currency: z.string().length(3).optional(),
});
export type RowPatchT = z.infer<typeof RowPatch>;

export async function updateImportRow(rowId: string, raw: RowPatchT) {
  const patch = RowPatch.parse(raw);
  const db = await getDb();
  const row = await db.query.importRows.findFirst({ where: eq(schema.importRows.id, rowId) });
  if (!row) throw new Error("Row not found");
  const set: Partial<typeof schema.importRows.$inferInsert> = {};
  if (patch.date !== undefined) set.date = patch.date;
  if (patch.description !== undefined) set.description = patch.description.trim();
  if (patch.merchant !== undefined) set.merchant = patch.merchant;
  if (patch.amount !== undefined) {
    set.amountMinor = Math.round(patch.amount * 100);
    if (!patch.type) set.type = set.amountMinor > 0 ? "INCOME" : "EXPENSE";
  }
  if (patch.categoryId !== undefined) set.categoryId = patch.categoryId;
  if (patch.type !== undefined) set.type = patch.type;
  if (patch.include !== undefined) set.include = patch.include;
  if (patch.currency !== undefined) set.currency = patch.currency.toUpperCase();
  const touchedData = patch.date !== undefined || patch.amount !== undefined || patch.description !== undefined;
  set.raw = { ...(row.raw ?? {}), userEdited: true, ...(patch.categoryId !== undefined ? { userCategory: true } : {}) };
  if (patch.categoryId || touchedData) set.confidence = 1;
  // Clear parse issues the user has fixed
  if (touchedData || patch.categoryId !== undefined) set.flags = row.flags.filter((f) => !["unparsed_date", "unparsed_amount", "low_confidence", "unverified_amount", "balance_break"].includes(f));
  await db.update(schema.importRows).set(set).where(eq(schema.importRows.id, rowId));
  await recordAudit({ action: "import_row.update", entity: "import_row", entityId: rowId, summary: `Edited import row ${row.rowIndex + 1} (${row.description.slice(0, 40)})`, before: { date: row.date, description: row.description, amountMinor: row.amountMinor, categoryId: row.categoryId, type: row.type, include: row.include }, after: { date: set.date ?? row.date, description: set.description ?? row.description, amountMinor: set.amountMinor ?? row.amountMinor, categoryId: set.categoryId === undefined ? row.categoryId : set.categoryId, type: set.type ?? row.type, include: set.include ?? row.include } });
  if (touchedData) await recomputeBatch(row.batchId);
  else await refreshStats(row.batchId);
  revalidatePath(`/import/${row.batchId}`);
  return { ok: true as const };
}

export async function setRowsInclude(batchId: string, rowIds: string[], include: boolean) {
  const db = await getDb();
  if (rowIds.length) await db.update(schema.importRows).set({ include }).where(and(eq(schema.importRows.batchId, batchId), inArray(schema.importRows.id, rowIds)));
  await recordAudit({ action: "import_row.update", entity: "import_row", entityId: batchId, summary: `${include ? "Included" : "Excluded"} ${rowIds.length} import row(s)` });
  await refreshStats(batchId);
  revalidatePath(`/import/${batchId}`);
  return { ok: true as const };
}

export async function setRowsCategory(batchId: string, rowIds: string[], categoryId: string | null) {
  const db = await getDb();
  if (rowIds.length) await db.update(schema.importRows).set({ categoryId, confidence: 1 }).where(and(eq(schema.importRows.batchId, batchId), inArray(schema.importRows.id, rowIds)));
  await recordAudit({ action: "import_row.update", entity: "import_row", entityId: batchId, summary: `Changed category of ${rowIds.length} import row(s)`, after: { categoryId } });
  await refreshStats(batchId);
  revalidatePath(`/import/${batchId}`);
  return { ok: true as const };
}

async function refreshStats(batchId: string) {
  const db = await getDb();
  const rows = await db.select().from(schema.importRows).where(eq(schema.importRows.batchId, batchId));
  const stats: BatchStats = {
    rows: rows.length,
    included: rows.filter((r) => r.include && !r.isDuplicate).length,
    duplicates: rows.filter((r) => r.isDuplicate).length,
    flagged: rows.filter((r) => r.flags.some((f) => f !== "duplicate")).length,
    creditsMinor: rows.filter((r) => (r.amountMinor ?? 0) > 0).reduce((a, r) => a + (r.amountMinor ?? 0), 0),
    debitsMinor: rows.filter((r) => (r.amountMinor ?? 0) < 0).reduce((a, r) => a + Math.abs(r.amountMinor ?? 0), 0),
    categorized: rows.filter((r) => r.categoryId).length,
  };
  await db.update(schema.importBatches).set({ stats }).where(eq(schema.importBatches.id, batchId));
}

/** Re-runs reconciliation + duplicate detection after the user edits dates/amounts. */
async function recomputeBatch(batchId: string) {
  const db = await getDb();
  const batch = await db.query.importBatches.findFirst({ where: eq(schema.importBatches.id, batchId) });
  if (!batch) return;
  const rows = await db.select().from(schema.importRows).where(eq(schema.importRows.batchId, batchId)).orderBy(schema.importRows.rowIndex);
  const txns: ParsedTxn[] = rows.map((r) => ({ rowIndex: r.rowIndex, date: r.date, description: r.description, amountMinor: r.amountMinor, balanceAfterMinor: r.balanceAfterMinor, reference: r.reference, currency: r.currency, raw: {}, issues: [] }));
  const meta = { ...(batch.detected ?? {}) };
  const recon = reconcile(txns, meta, null, "manual");
  // duplicates
  const seen = new Map<string, number>();
  for (const r of rows) {
    const t = txns.find((x) => x.rowIndex === r.rowIndex)!;
    let fingerprint: string | null = null;
    let isDuplicate = false;
    if (r.date && r.amountMinor !== null) {
      const base = fingerprintBase(batch.accountId, r.date, r.amountMinor, r.description);
      const k = (seen.get(base) ?? 0) + 1;
      seen.set(base, k);
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.transactions).where(sql`split_part(${schema.transactions.fingerprint}, '#', 1) = ${base}`);
      isDuplicate = k <= Number(n);
      fingerprint = fingerprintWithIndex(base, k);
    }
    const flags = r.flags.filter((f) => !["duplicate", "balance_break", "date_outside_period"].includes(f));
    for (const i of t.issues) if (!flags.includes(i)) flags.push(i);
    if (isDuplicate) flags.push("duplicate");
    await db.update(schema.importRows).set({ flags, isDuplicate, raw: { ...(r.raw ?? {}), fingerprint } }).where(eq(schema.importRows.id, r.id));
  }
  await db.update(schema.importBatches).set({ reconciliation: recon, detected: meta }).where(eq(schema.importBatches.id, batchId));
  await refreshStats(batchId);
}

/** Writes the reviewed rows into the ledger atomically. */
export async function commitBatch(batchId: string) {
  const res = await commitBatchCore(batchId);
  const b = await (await getDb()).query.importBatches.findFirst({ where: eq(schema.importBatches.id, batchId), with: { account: true } });
  await recordAudit({ action: "import.commit", entity: "import", entityId: batchId, summary: `Committed ${res.inserted} transactions from "${b?.fileName ?? batchId}" into ${b?.account.name ?? "account"}` });
  for (const p of ["/", "/transactions", "/income", "/expenses", "/reports", "/import", `/import/${batchId}`, "/recurring"]) revalidatePath(p);
  return res;
}

export async function deleteBatch(batchId: string, opts: { deleteTransactions?: boolean } = {}) {
  const db = await getDb();
  const batch = await db.query.importBatches.findFirst({ where: eq(schema.importBatches.id, batchId) });
  if (!batch) return { ok: true as const };
  if (opts.deleteTransactions) await db.delete(schema.transactions).where(eq(schema.transactions.importBatchId, batchId));
  await db.delete(schema.importBatches).where(eq(schema.importBatches.id, batchId));
  await deleteFile(batch.storagePath);
  await recordAudit({ action: "import.delete", entity: "import", entityId: batchId, summary: `Deleted import "${batch.fileName}"${opts.deleteTransactions ? " and its transactions" : ""}` });
  for (const p of ["/", "/transactions", "/import"]) revalidatePath(p);
  return { ok: true as const };
}
