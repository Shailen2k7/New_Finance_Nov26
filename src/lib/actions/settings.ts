"use server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "../db";
import { recordAudit } from "../audit";
import { getSettings } from "../settings";
import { getFxRate } from "../fx";

const SettingsInput = z.object({
  businessName: z.string().min(1).max(120),
  baseCurrency: z.string().length(3),
  fiscalYearStart: z.number().int().min(1).max(12),
  anthropicApiKey: z.string().max(300).optional().nullable(),
  aiModel: z.string().max(80).optional(),
  sharedPassword: z.string().max(200).optional().nullable(),
});
export type SettingsInputT = z.infer<typeof SettingsInput>;

export async function updateSettings(raw: SettingsInputT) {
  const input = SettingsInput.parse(raw);
  const db = await getDb();
  const before = await getSettings();
  const set: Partial<typeof schema.settings.$inferInsert> = {
    businessName: input.businessName.trim(),
    baseCurrency: input.baseCurrency.toUpperCase(),
    fiscalYearStart: input.fiscalYearStart,
    aiModel: input.aiModel || "claude-opus-5-5",
    updatedAt: new Date(),
  };
  // Only overwrite the key if a new value was provided (blank = keep, "CLEAR" = remove)
  if (input.anthropicApiKey === "CLEAR") set.anthropicApiKey = null;
  else if (input.anthropicApiKey) set.anthropicApiKey = input.anthropicApiKey.trim();
  if (input.sharedPassword && !process.env.APP_PASSWORD) {
    if (input.sharedPassword.trim().length < 6) throw new Error("The shared password must be at least 6 characters");
    set.sharedPassword = input.sharedPassword.trim();
  }
  await db.update(schema.settings).set(set).where(eq(schema.settings.id, 1));
  const changes: string[] = [];
  if (before.businessName !== set.businessName) changes.push(`business name → "${set.businessName}"`);
  if (before.baseCurrency !== set.baseCurrency) changes.push(`base currency ${before.baseCurrency} → ${set.baseCurrency}`);
  if (before.fiscalYearStart !== set.fiscalYearStart) changes.push(`fiscal year start → month ${set.fiscalYearStart}`);
  if (before.aiModel !== set.aiModel) changes.push(`AI model → ${set.aiModel}`);
  if (input.anthropicApiKey === "CLEAR") changes.push("API key removed");
  else if (input.anthropicApiKey) changes.push("API key changed");
  if (set.sharedPassword) changes.push("shared password changed");
  if (changes.length) {
    await recordAudit({
      action: "settings.update",
      entity: "settings",
      entityId: "1",
      summary: `Updated settings: ${changes.join(", ")}`,
      before: { businessName: before.businessName, baseCurrency: before.baseCurrency, fiscalYearStart: before.fiscalYearStart, aiModel: before.aiModel },
      after: { businessName: set.businessName, baseCurrency: set.baseCurrency, fiscalYearStart: set.fiscalYearStart, aiModel: set.aiModel },
    });
  }

  let recomputed = 0;
  if (before.baseCurrency !== set.baseCurrency) recomputed = await recomputeBaseAmounts(set.baseCurrency!);
  for (const p of ["/", "/settings", "/transactions", "/reports", "/income", "/expenses"]) revalidatePath(p);
  return { ok: true as const, recomputed };
}

/** Re-converts every transaction into the (new) base currency using historical FX rates. */
export async function recomputeBaseAmounts(baseCurrency: string) {
  const db = await getDb();
  const groups = await db
    .select({ currency: schema.transactions.currency, date: schema.transactions.date, n: sql<number>`count(*)::int` })
    .from(schema.transactions)
    .groupBy(schema.transactions.currency, schema.transactions.date);
  let count = 0;
  for (const g of groups) {
    const { rate } = await getFxRate(g.currency, baseCurrency, g.date);
    await db
      .update(schema.transactions)
      .set({ baseAmountMinor: sql`round(${schema.transactions.amountMinor} * ${rate})`, fxRate: rate.toFixed(8) })
      .where(sql`${schema.transactions.currency} = ${g.currency} and ${schema.transactions.date} = ${g.date}`);
    count += Number(g.n);
  }
  return count;
}
