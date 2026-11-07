import { eq, and, sql } from "drizzle-orm";
import { getDb, schema } from "../db";
import { convertMinor } from "../fx";
import { getSettings } from "../settings";
import { fingerprintBase, fingerprintWithIndex } from "../fingerprint";
import { advanceDate } from "../recurring-utils";
import { normalizeMerchantKey } from "../utils";

/** Remember merchant -> category (same behaviour as the server action, usable outside Next). */
export async function learnRuleCore(descriptionOrMerchant: string, categoryId: string) {
  const key = normalizeMerchantKey(descriptionOrMerchant);
  if (!key || key.length < 3) return;
  const db = await getDb();
  await db
    .insert(schema.categoryRules)
    .values({ pattern: key, merchantLabel: descriptionOrMerchant.slice(0, 120), categoryId, source: "USER", hits: 1 })
    .onConflictDoUpdate({ target: schema.categoryRules.pattern, set: { categoryId, source: "USER", hits: sql`${schema.categoryRules.hits} + 1` } });
}

/** Writes the reviewed rows of a batch into the ledger atomically. Pure (no Next.js cache calls). */
export async function commitBatchCore(batchId: string) {
  const db = await getDb();
  const settings = await getSettings();
  const batch = await db.query.importBatches.findFirst({ where: eq(schema.importBatches.id, batchId) });
  if (!batch) throw new Error("Batch not found");
  if (batch.status === "COMMITTED") throw new Error("This import was already committed");
  const rows = await db.select().from(schema.importRows).where(and(eq(schema.importRows.batchId, batchId), eq(schema.importRows.include, true), eq(schema.importRows.isDuplicate, false)));
  const ready = rows.filter((r) => r.date && r.amountMinor !== null);
  const values: (typeof schema.transactions.$inferInsert)[] = [];
  const fxCache = new Map<string, number>();
  for (const r of ready) {
    const k = `${r.currency}:${r.date}`;
    let rate = fxCache.get(k);
    if (rate === undefined) {
      rate = (await convertMinor(100, r.currency, settings.baseCurrency, r.date!)).rate;
      fxCache.set(k, rate);
    }
    const fp = (r.raw?.fingerprint as string | undefined) ?? fingerprintWithIndex(fingerprintBase(batch.accountId, r.date!, r.amountMinor!, r.description), 1);
    values.push({
      accountId: batch.accountId,
      date: r.date!,
      description: r.description,
      merchant: r.merchant,
      amountMinor: r.amountMinor!,
      currency: r.currency,
      baseAmountMinor: Math.round(r.amountMinor! * rate),
      fxRate: rate.toFixed(8),
      type: r.type,
      categoryId: r.type === "TRANSFER" ? null : r.categoryId,
      reference: r.reference,
      fingerprint: fp,
      importBatchId: batchId,
      recurringId: (r.raw?.recurringId as string | null | undefined) ?? null,
      confidence: r.confidence,
      isReviewed: r.confidence >= 0.8,
    });
  }
  let inserted = 0;
  await db.transaction(async (tx) => {
    for (let i = 0; i < values.length; i += 200) {
      const res = await tx.insert(schema.transactions).values(values.slice(i, i + 200)).onConflictDoNothing({ target: schema.transactions.fingerprint }).returning({ id: schema.transactions.id });
      inserted += res.length;
    }
    await tx.update(schema.importBatches).set({ status: "COMMITTED", stage: "Committed", committedAt: new Date(), stats: { ...(batch.stats ?? { rows: 0, included: 0, duplicates: 0, flagged: 0, creditsMinor: 0, debitsMinor: 0, categorized: 0 }), included: inserted } }).where(eq(schema.importBatches.id, batchId));
  });
  for (const r of ready) if (r.categoryId && r.raw?.userCategory) await learnRuleCore(r.merchant || r.description, r.categoryId);
  const recIds = [...new Set(ready.map((r) => r.raw?.recurringId as string | undefined).filter((x): x is string => Boolean(x)))];
  for (const id of recIds) {
    const rec = await db.query.recurringPayments.findFirst({ where: eq(schema.recurringPayments.id, id) });
    if (!rec) continue;
    const latest = ready.filter((r) => r.raw?.recurringId === id).map((r) => r.date!).sort().pop()!;
    let next = rec.nextDueDate;
    while (next <= latest) next = advanceDate(next, rec.frequency);
    if (next !== rec.nextDueDate) await db.update(schema.recurringPayments).set({ nextDueDate: next }).where(eq(schema.recurringPayments.id, id));
  }
  return { ok: true as const, inserted, skipped: ready.length - inserted, accountId: batch.accountId };
}
