"use server";
import { z } from "zod";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "../db";
import { recordAudit } from "../audit";
import { formatMoney } from "../money";
import { formatDate } from "../dates";
import { convertMinor } from "../fx";
import { getSettings } from "../settings";
import { toMinor } from "../money";
import { manualFingerprint } from "../fingerprint";
import { normalizeMerchantKey } from "../utils";

const TxnInput = z.object({
  accountId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().min(1).max(500),
  merchant: z.string().max(200).optional().nullable(),
  amount: z.number().positive(),
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
  flow: z.enum(["IN", "OUT"]).optional(), // for TRANSFER
  currency: z.string().length(3).optional(),
  categoryId: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  reference: z.string().max(200).optional().nullable(),
  tags: z.array(z.string()).optional(),
  status: z.enum(["CLEARED", "PENDING"]).optional(),
  loanId: z.string().uuid().optional().nullable(),
  recurringId: z.string().uuid().optional().nullable(),
});
export type TxnInputT = z.infer<typeof TxnInput>;

function txnLabel(t: { type: string; amountMinor: number; currency: string; description: string; merchant?: string | null; date: string }) {
  const kind = t.type === "INCOME" ? "income" : t.type === "EXPENSE" ? "expense" : "transfer";
  return `${kind} ${formatMoney(Math.abs(t.amountMinor), t.currency)} "${t.merchant || t.description}" on ${formatDate(t.date)}`;
}

function revalidateAll() {
  for (const p of ["/", "/transactions", "/income", "/expenses", "/reports", "/loans", "/recurring", "/accounts"]) revalidatePath(p);
}

async function prepare(input: TxnInputT) {
  const db = await getDb();
  const settings = await getSettings();
  const acct = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, input.accountId) });
  if (!acct) throw new Error("Account not found");
  const currency = (input.currency ?? acct.currency).toUpperCase();
  const magnitude = toMinor(input.amount);
  const amountMinor = input.type === "INCOME" ? magnitude : input.type === "EXPENSE" ? -magnitude : input.flow === "IN" ? magnitude : -magnitude;
  const { baseAmountMinor, rate } = await convertMinor(amountMinor, currency, settings.baseCurrency, input.date);
  return { db, currency, amountMinor, baseAmountMinor, rate };
}

export async function createTransaction(raw: TxnInputT) {
  const input = TxnInput.parse(raw);
  const { db, currency, amountMinor, baseAmountMinor, rate } = await prepare(input);
  const [row] = await db
    .insert(schema.transactions)
    .values({
      accountId: input.accountId,
      date: input.date,
      description: input.description.trim(),
      merchant: input.merchant?.trim() || null,
      amountMinor,
      currency,
      baseAmountMinor,
      fxRate: rate.toFixed(8),
      type: input.type,
      categoryId: input.type === "TRANSFER" ? null : input.categoryId ?? null,
      notes: input.notes || null,
      reference: input.reference || null,
      tags: input.tags ?? [],
      fingerprint: manualFingerprint(),
      status: input.status ?? "CLEARED",
      loanId: input.loanId ?? null,
      recurringId: input.recurringId ?? null,
    })
    .returning();
  if (input.categoryId) await learnRule(input.merchant || input.description, input.categoryId);
  await recordAudit({ action: "transaction.create", entity: "transaction", entityId: row.id, summary: `Added ${txnLabel(row)}`, after: row });
  revalidateAll();
  return { ok: true as const, id: row.id };
}

export async function updateTransaction(id: string, raw: TxnInputT, opts: { applyToSimilar?: boolean } = {}) {
  const input = TxnInput.parse(raw);
  const { db, currency, amountMinor, baseAmountMinor, rate } = await prepare(input);
  const before = await db.query.transactions.findFirst({ where: eq(schema.transactions.id, id) });
  const [after] = await db
    .update(schema.transactions)
    .set({
      accountId: input.accountId,
      date: input.date,
      description: input.description.trim(),
      merchant: input.merchant?.trim() || null,
      amountMinor,
      currency,
      baseAmountMinor,
      fxRate: rate.toFixed(8),
      type: input.type,
      categoryId: input.type === "TRANSFER" ? null : input.categoryId ?? null,
      notes: input.notes || null,
      reference: input.reference || null,
      tags: input.tags ?? [],
      status: input.status ?? "CLEARED",
      loanId: input.loanId ?? null,
      recurringId: input.recurringId ?? null,
      isReviewed: true,
      updatedAt: new Date(),
    })
    .where(eq(schema.transactions.id, id))
    .returning();
  await recordAudit({ action: "transaction.update", entity: "transaction", entityId: id, summary: `Edited ${txnLabel(after)}`, before, after });
  let similarUpdated = 0;
  if (input.categoryId) {
    await learnRule(input.merchant || input.description, input.categoryId);
    if (opts.applyToSimilar) similarUpdated = await applyRuleToUncategorized(input.merchant || input.description, input.categoryId);
  }
  revalidateAll();
  return { ok: true as const, similarUpdated };
}

export async function setTransactionCategory(ids: string[], categoryId: string | null, opts: { applyToSimilar?: boolean } = {}) {
  const db = await getDb();
  if (!ids.length) return { ok: true as const, similarUpdated: 0 };
  const rows = await db.select().from(schema.transactions).where(inArray(schema.transactions.id, ids));
  await db.update(schema.transactions).set({ categoryId, isReviewed: true, updatedAt: new Date() }).where(inArray(schema.transactions.id, ids));
  const cat = categoryId ? await db.query.categories.findFirst({ where: eq(schema.categories.id, categoryId) }) : null;
  await recordAudit({
    action: "transaction.update",
    entity: "transaction",
    entityId: ids.length === 1 ? ids[0] : null,
    summary: ids.length === 1 && rows[0] ? `Set category of ${txnLabel(rows[0])} to ${cat?.name ?? "Uncategorized"}` : `Changed category of ${ids.length} transactions to ${cat?.name ?? "Uncategorized"}`,
    before: ids.length === 1 ? rows[0] : { ids, categoryIds: rows.map((r) => r.categoryId) },
    after: ids.length === 1 ? { ...rows[0], categoryId } : { ids, categoryId },
  });
  let similarUpdated = 0;
  if (categoryId) {
    for (const r of rows) {
      await learnRule(r.merchant || r.description, categoryId);
      if (opts.applyToSimilar) similarUpdated += await applyRuleToUncategorized(r.merchant || r.description, categoryId);
    }
  }
  revalidateAll();
  return { ok: true as const, similarUpdated };
}

export async function deleteTransactions(ids: string[]) {
  const db = await getDb();
  if (!ids.length) return { ok: true as const };
  const rows = await db.select().from(schema.transactions).where(inArray(schema.transactions.id, ids));
  await db.delete(schema.loanPayments).where(inArray(schema.loanPayments.transactionId, ids));
  await db.delete(schema.transactions).where(inArray(schema.transactions.id, ids));
  if (rows.length === 1) await recordAudit({ action: "transaction.delete", entity: "transaction", entityId: rows[0].id, summary: `Deleted ${txnLabel(rows[0])}`, before: rows[0] });
  else await recordAudit({ action: "transaction.delete", entity: "transaction", summary: `Deleted ${rows.length} transactions (${rows.slice(0, 3).map((r) => `"${r.merchant || r.description}"`).join(", ")}${rows.length > 3 ? "…" : ""})`, before: { ids: rows.map((r) => r.id), descriptions: rows.map((r) => r.description) } });
  revalidateAll();
  return { ok: true as const };
}

export async function countSimilarUncategorized(descriptionOrMerchant: string) {
  const key = normalizeMerchantKey(descriptionOrMerchant);
  if (!key) return 0;
  const db = await getDb();
  const [r] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(schema.transactions)
    .where(and(isNull(schema.transactions.categoryId), sql`upper(coalesce(${schema.transactions.merchant}, ${schema.transactions.description})) like ${"%" + key.split(" ")[0] + "%"}`));
  return Number(r?.c ?? 0);
}

/** Remember merchant -> category so future imports are categorized automatically. */
export async function learnRule(descriptionOrMerchant: string, categoryId: string) {
  const key = normalizeMerchantKey(descriptionOrMerchant);
  if (!key || key.length < 3) return;
  const db = await getDb();
  await db
    .insert(schema.categoryRules)
    .values({ pattern: key, merchantLabel: descriptionOrMerchant.slice(0, 120), categoryId, source: "USER", hits: 1 })
    .onConflictDoUpdate({ target: schema.categoryRules.pattern, set: { categoryId, source: "USER", hits: sql`${schema.categoryRules.hits} + 1` } });
}

async function applyRuleToUncategorized(descriptionOrMerchant: string, categoryId: string) {
  const key = normalizeMerchantKey(descriptionOrMerchant);
  if (!key) return 0;
  const db = await getDb();
  const candidates = await db.select({ id: schema.transactions.id, d: schema.transactions.description, m: schema.transactions.merchant }).from(schema.transactions).where(isNull(schema.transactions.categoryId));
  const ids = candidates.filter((c) => normalizeMerchantKey(c.m || c.d) === key).map((c) => c.id);
  if (ids.length) await db.update(schema.transactions).set({ categoryId, updatedAt: new Date() }).where(inArray(schema.transactions.id, ids));
  return ids.length;
}
