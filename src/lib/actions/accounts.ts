"use server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "../db";
import { recordAudit } from "../audit";
import { toMinor } from "../money";

const AccountInput = z.object({
  name: z.string().min(1).max(120),
  institution: z.string().max(120).optional().nullable(),
  type: z.enum(["BANK", "CARD", "CASH", "WALLET", "SAVINGS"]),
  currency: z.string().length(3),
  lastFour: z.string().max(8).optional().nullable(),
  openingBalance: z.number().optional(),
  openingBalanceDate: z.string().optional().nullable(),
  color: z.string().optional(),
});
export type AccountInputT = z.infer<typeof AccountInput>;

export async function upsertAccount(raw: AccountInputT, id?: string) {
  const input = AccountInput.parse(raw);
  const db = await getDb();
  const values = {
    name: input.name.trim(),
    institution: input.institution || null,
    type: input.type,
    currency: input.currency.toUpperCase(),
    lastFour: input.lastFour || null,
    openingBalanceMinor: toMinor(input.openingBalance ?? 0),
    openingBalanceDate: input.openingBalanceDate || null,
    color: input.color || "#2563eb",
  };
  let accountId = id;
  if (id) {
    const before = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, id) });
    const [after] = await db.update(schema.accounts).set(values).where(eq(schema.accounts.id, id)).returning();
    await recordAudit({ action: "account.update", entity: "account", entityId: id, summary: `Edited account "${values.name}"`, before, after });
  } else {
    const [row] = await db.insert(schema.accounts).values(values).returning();
    accountId = row.id;
    await recordAudit({ action: "account.create", entity: "account", entityId: row.id, summary: `Added account "${row.name}" (${row.currency})`, after: row });
  }
  revalidatePath("/accounts");
  revalidatePath("/");
  return { ok: true as const, id: accountId! };
}

export async function archiveAccount(id: string, archived = true) {
  const db = await getDb();
  const [row] = await db.update(schema.accounts).set({ isArchived: archived }).where(eq(schema.accounts.id, id)).returning();
  await recordAudit({ action: "account.update", entity: "account", entityId: id, summary: `${archived ? "Archived" : "Restored"} account "${row?.name ?? id}"`, before: { isArchived: !archived }, after: { isArchived: archived } });
  revalidatePath("/accounts");
  return { ok: true as const };
}

export async function deleteAccount(id: string) {
  const db = await getDb();
  const before = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, id) });
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.transactions).where(eq(schema.transactions.accountId, id));
  await db.delete(schema.accounts).where(eq(schema.accounts.id, id));
  await recordAudit({ action: "account.delete", entity: "account", entityId: id, summary: `Deleted account "${before?.name ?? id}" and its ${Number(n)} transactions`, before });
  revalidatePath("/accounts");
  revalidatePath("/");
  return { ok: true as const };
}

export async function getAccountBalances() {
  const db = await getDb();
  const rows = await db
    .select({
      id: schema.accounts.id,
      sum: sql<number>`coalesce(sum(${schema.transactions.amountMinor}), 0)::bigint`,
      count: sql<number>`count(${schema.transactions.id})::int`,
    })
    .from(schema.accounts)
    .leftJoin(schema.transactions, eq(schema.transactions.accountId, schema.accounts.id))
    .groupBy(schema.accounts.id);
  return Object.fromEntries(rows.map((r) => [r.id, { sumMinor: Number(r.sum), count: Number(r.count) }]));
}
