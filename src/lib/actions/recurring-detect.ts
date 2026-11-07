"use server";
import { asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { recordAudit } from "../audit";
import { getDb, schema } from "../db";
import { normalizeMerchantKey } from "../utils";
import { toISO } from "../dates";

export type RecurringSuggestion = {
  key: string;
  name: string;
  merchantPattern: string;
  amountMinor: number; // signed
  currency: string;
  type: "INCOME" | "EXPENSE";
  frequency: "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
  nextDueDate: string;
  categoryId: string | null;
  accountId: string | null;
  count: number;
  lastDate: string;
};

const PERIODS: { days: number; frequency: RecurringSuggestion["frequency"]; tol: number }[] = [
  { days: 7, frequency: "WEEKLY", tol: 2 },
  { days: 14, frequency: "BIWEEKLY", tol: 3 },
  { days: 30.44, frequency: "MONTHLY", tol: 4 },
  { days: 91.3, frequency: "QUARTERLY", tol: 6 },
  { days: 365.25, frequency: "YEARLY", tol: 10 },
];

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000);
}

function mode<T>(items: T[]): T | null {
  const m = new Map<T, number>();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  let best: T | null = null, n = 0;
  for (const [k, v] of m) if (v > n) { best = k; n = v; }
  return best;
}

export async function detectRecurring(): Promise<RecurringSuggestion[]> {
  const db = await getDb();
  const txns = await db
    .select({ date: schema.transactions.date, description: schema.transactions.description, merchant: schema.transactions.merchant, amountMinor: schema.transactions.amountMinor, currency: schema.transactions.currency, type: schema.transactions.type, categoryId: schema.transactions.categoryId, accountId: schema.transactions.accountId })
    .from(schema.transactions)
    .orderBy(asc(schema.transactions.date));
  const existing = await db.select({ p: schema.recurringPayments.merchantPattern, n: schema.recurringPayments.name }).from(schema.recurringPayments);
  const existingKeys = new Set(existing.flatMap((e) => [e.p, e.n].filter(Boolean).map((s) => normalizeMerchantKey(s!))));

  const groups = new Map<string, typeof txns>();
  for (const t of txns) {
    if (t.type === "TRANSFER") continue;
    const key = `${normalizeMerchantKey(t.merchant || t.description)}|${t.currency}|${t.amountMinor < 0 ? "E" : "I"}`;
    if (!key.startsWith("|")) groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  const out: RecurringSuggestion[] = [];
  for (const [key, list] of groups) {
    if (list.length < 3) continue;
    const merchantKey = key.split("|")[0];
    if (existingKeys.has(merchantKey)) continue;
    // Amounts within 15% of the median
    const mags = list.map((t) => Math.abs(t.amountMinor)).sort((a, b) => a - b);
    const median = mags[Math.floor(mags.length / 2)];
    if (!median || mags.some((m) => Math.abs(m - median) / median > 0.15)) continue;
    // Consistent intervals
    const dates = [...new Set(list.map((t) => t.date))].sort();
    if (dates.length < 3) continue;
    const gaps = dates.slice(1).map((d, i) => daysBetween(dates[i], d));
    const period = PERIODS.find((p) => gaps.every((g) => Math.abs(g - p.days) <= p.tol));
    if (!period) continue;
    const last = list[list.length - 1];
    const next = new Date(dates[dates.length - 1] + "T00:00:00");
    next.setDate(next.getDate() + Math.round(period.days));
    const isIncome = last.amountMinor > 0;
    out.push({
      key,
      name: (last.merchant || last.description).slice(0, 80),
      merchantPattern: last.merchant || last.description,
      amountMinor: (isIncome ? 1 : -1) * median,
      currency: last.currency,
      type: isIncome ? "INCOME" : "EXPENSE",
      frequency: period.frequency,
      nextDueDate: toISO(next),
      categoryId: mode(list.map((t) => t.categoryId).filter(Boolean)) ?? null,
      accountId: mode(list.map((t) => t.accountId)) ?? null,
      count: list.length,
      lastDate: dates[dates.length - 1],
    });
  }
  return out.sort((a, b) => b.count - a.count);
}

export async function addDetectedRecurring(items: RecurringSuggestion[]) {
  const db = await getDb();
  if (!items.length) return { ok: true as const, added: 0 };
  const rows = await db.insert(schema.recurringPayments).values(
    items.map((s) => ({
      name: s.name,
      merchantPattern: s.merchantPattern,
      amountMinor: s.amountMinor,
      currency: s.currency,
      type: s.type,
      frequency: s.frequency,
      nextDueDate: s.nextDueDate,
      categoryId: s.categoryId,
      accountId: s.accountId,
      isActive: true,
      autoDetected: true,
    })),
  ).returning();
  await recordAudit({ action: "recurring.create", entity: "recurring", entityId: rows.length === 1 ? rows[0].id : null, summary: `Added ${rows.length} detected recurring payment${rows.length === 1 ? "" : "s"}: ${rows.slice(0, 4).map((r) => `"${r.name}"`).join(", ")}${rows.length > 4 ? "…" : ""}`, after: { ids: rows.map((r) => r.id), names: rows.map((r) => r.name) } });
  revalidatePath("/recurring");
  revalidatePath("/");
  return { ok: true as const, added: items.length };
}
