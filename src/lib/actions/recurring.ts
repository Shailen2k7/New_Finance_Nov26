"use server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "../db";
import { recordAudit } from "../audit";
import { formatMoney } from "../money";
import { formatDate } from "../dates";
import { toMinor } from "../money";
import { advanceDate } from "../recurring-utils";
import { createTransaction } from "./transactions";

const RecurringInput = z.object({
  name: z.string().min(1).max(120),
  merchantPattern: z.string().max(200).optional().nullable(),
  amount: z.number().positive(),
  currency: z.string().length(3),
  type: z.enum(["INCOME", "EXPENSE"]),
  frequency: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY"]),
  nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  accountId: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
});
export type RecurringInputT = z.infer<typeof RecurringInput>;

export async function upsertRecurring(raw: RecurringInputT, id?: string) {
  const input = RecurringInput.parse(raw);
  const db = await getDb();
  const magnitude = toMinor(input.amount);
  const values = {
    name: input.name.trim(),
    merchantPattern: input.merchantPattern || null,
    amountMinor: input.type === "INCOME" ? magnitude : -magnitude,
    currency: input.currency.toUpperCase(),
    type: input.type,
    frequency: input.frequency,
    nextDueDate: input.nextDueDate,
    endDate: input.endDate || null,
    categoryId: input.categoryId ?? null,
    accountId: input.accountId ?? null,
    notes: input.notes || null,
    isActive: input.isActive ?? true,
  };
  if (id) {
    const before = await db.query.recurringPayments.findFirst({ where: eq(schema.recurringPayments.id, id) });
    const [after] = await db.update(schema.recurringPayments).set(values).where(eq(schema.recurringPayments.id, id)).returning();
    await recordAudit({ action: "recurring.update", entity: "recurring", entityId: id, summary: `Edited recurring payment "${values.name}"`, before, after });
  } else {
    const [row] = await db.insert(schema.recurringPayments).values(values).returning();
    await recordAudit({ action: "recurring.create", entity: "recurring", entityId: row.id, summary: `Added recurring ${row.type.toLowerCase()} "${row.name}" ${formatMoney(Math.abs(row.amountMinor), row.currency)} ${row.frequency.toLowerCase()}`, after: row });
  }
  revalidatePath("/recurring");
  revalidatePath("/");
  return { ok: true as const };
}

export async function deleteRecurring(id: string) {
  const db = await getDb();
  const before = await db.query.recurringPayments.findFirst({ where: eq(schema.recurringPayments.id, id) });
  await db.update(schema.transactions).set({ recurringId: null }).where(eq(schema.transactions.recurringId, id));
  await db.delete(schema.recurringPayments).where(eq(schema.recurringPayments.id, id));
  await recordAudit({ action: "recurring.delete", entity: "recurring", entityId: id, summary: `Deleted recurring payment "${before?.name ?? id}"`, before });
  revalidatePath("/recurring");
  return { ok: true as const };
}

export async function toggleRecurring(id: string, isActive: boolean) {
  const db = await getDb();
  const [row] = await db.update(schema.recurringPayments).set({ isActive }).where(eq(schema.recurringPayments.id, id)).returning();
  await recordAudit({ action: "recurring.update", entity: "recurring", entityId: id, summary: `${isActive ? "Resumed" : "Paused"} recurring payment "${row?.name ?? id}"`, before: { isActive: !isActive }, after: { isActive } });
  revalidatePath("/recurring");
  return { ok: true as const };
}

/** Records the payment as a transaction and advances the next due date. */
export async function markRecurringPaid(id: string, opts: { date?: string; amount?: number; accountId?: string; createTransaction?: boolean } = {}) {
  const db = await getDb();
  const r = await db.query.recurringPayments.findFirst({ where: eq(schema.recurringPayments.id, id) });
  if (!r) throw new Error("Recurring payment not found");
  const date = opts.date ?? r.nextDueDate;
  const accountId = opts.accountId ?? r.accountId;
  if (opts.createTransaction !== false) {
    if (!accountId) throw new Error("Choose an account to record the payment against");
    await createTransaction({
      accountId,
      date,
      description: r.name,
      merchant: r.merchantPattern ?? undefined,
      amount: opts.amount ?? Math.abs(r.amountMinor) / 100,
      type: r.type === "TRANSFER" ? "EXPENSE" : r.type,
      currency: r.currency,
      categoryId: r.categoryId ?? null,
      recurringId: r.id,
    });
  }
  let next = advanceDate(r.nextDueDate, r.frequency);
  // If the user paid late (several periods behind), advance until the next due date is in the future of the paid date
  while (next <= date) next = advanceDate(next, r.frequency);
  await db.update(schema.recurringPayments).set({ nextDueDate: next }).where(eq(schema.recurringPayments.id, id));
  await recordAudit({ action: "recurring.update", entity: "recurring", entityId: id, summary: `Marked "${r.name}" paid on ${formatDate(date)}; next due ${formatDate(next)}`, before: { nextDueDate: r.nextDueDate }, after: { nextDueDate: next, paidOn: date } });
  revalidatePath("/recurring");
  revalidatePath("/");
  return { ok: true as const, nextDueDate: next };
}

export async function skipRecurring(id: string) {
  const db = await getDb();
  const r = await db.query.recurringPayments.findFirst({ where: eq(schema.recurringPayments.id, id) });
  if (!r) throw new Error("Not found");
  const next = advanceDate(r.nextDueDate, r.frequency);
  await db.update(schema.recurringPayments).set({ nextDueDate: next }).where(eq(schema.recurringPayments.id, id));
  await recordAudit({ action: "recurring.update", entity: "recurring", entityId: id, summary: `Skipped "${r.name}" due ${formatDate(r.nextDueDate)}; next due ${formatDate(next)}`, before: { nextDueDate: r.nextDueDate }, after: { nextDueDate: next } });
  revalidatePath("/recurring");
  return { ok: true as const };
}
