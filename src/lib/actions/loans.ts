"use server";
import { z } from "zod";
import { eq, and, ilike } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "../db";
import { recordAudit } from "../audit";
import { formatMoney } from "../money";
import { formatDate } from "../dates";
import { toMinor } from "../money";
import { createTransaction } from "./transactions";

const LoanInput = z.object({
  name: z.string().min(1).max(120),
  counterparty: z.string().max(120).optional().nullable(),
  direction: z.enum(["BORROWED", "LENT"]),
  principal: z.number().positive(),
  currency: z.string().length(3),
  interestRateApr: z.number().min(0).max(100).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  termMonths: z.number().int().positive().optional().nullable(),
  paymentAmount: z.number().positive().optional().nullable(),
  paymentDay: z.number().int().min(1).max(31).optional().nullable(),
  accountId: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  createDisbursementTransaction: z.boolean().optional(),
});
export type LoanInputT = z.infer<typeof LoanInput>;

async function findCategory(name: string, type: "INCOME" | "EXPENSE") {
  const db = await getDb();
  return db.query.categories.findFirst({ where: and(ilike(schema.categories.name, name), eq(schema.categories.type, type)) });
}

export async function upsertLoan(raw: LoanInputT, id?: string) {
  const input = LoanInput.parse(raw);
  const db = await getDb();
  const values = {
    name: input.name.trim(),
    counterparty: input.counterparty || null,
    direction: input.direction,
    principalMinor: toMinor(input.principal),
    currency: input.currency.toUpperCase(),
    interestRateApr: (input.interestRateApr ?? 0).toFixed(4),
    startDate: input.startDate,
    termMonths: input.termMonths ?? null,
    paymentAmountMinor: input.paymentAmount ? toMinor(input.paymentAmount) : null,
    paymentDay: input.paymentDay ?? null,
    accountId: input.accountId ?? null,
    notes: input.notes || null,
  };
  let loanId = id;
  if (id) {
    const before = await db.query.loans.findFirst({ where: eq(schema.loans.id, id) });
    const [after] = await db.update(schema.loans).set(values).where(eq(schema.loans.id, id)).returning();
    await recordAudit({ action: "loan.update", entity: "loan", entityId: id, summary: `Edited loan "${values.name}"`, before, after });
  } else {
    const [row] = await db.insert(schema.loans).values(values).returning();
    loanId = row.id;
    await recordAudit({ action: "loan.create", entity: "loan", entityId: row.id, summary: `Added ${row.direction === "BORROWED" ? "borrowed" : "lent"} loan "${row.name}" of ${formatMoney(row.principalMinor, row.currency)}`, after: row });
    if (input.createDisbursementTransaction && input.accountId) {
      const isBorrowed = input.direction === "BORROWED";
      const cat = isBorrowed ? await findCategory("Loan Received", "INCOME") : await findCategory("Other Expenses", "EXPENSE");
      await createTransaction({
        accountId: input.accountId,
        date: input.startDate,
        description: isBorrowed ? `Loan received: ${input.name}` : `Loan given: ${input.name}`,
        merchant: input.counterparty ?? undefined,
        amount: input.principal,
        type: isBorrowed ? "INCOME" : "EXPENSE",
        currency: input.currency,
        categoryId: cat?.id ?? null,
        loanId,
      });
    }
  }
  revalidatePath("/loans");
  revalidatePath("/");
  return { ok: true as const, id: loanId! };
}

export async function deleteLoan(id: string) {
  const db = await getDb();
  const before = await db.query.loans.findFirst({ where: eq(schema.loans.id, id) });
  await db.update(schema.transactions).set({ loanId: null }).where(eq(schema.transactions.loanId, id));
  await db.delete(schema.loans).where(eq(schema.loans.id, id));
  await recordAudit({ action: "loan.delete", entity: "loan", entityId: id, summary: `Deleted loan "${before?.name ?? id}"`, before });
  revalidatePath("/loans");
  return { ok: true as const };
}

export async function setLoanStatus(id: string, status: "ACTIVE" | "CLOSED") {
  const db = await getDb();
  const [row] = await db.update(schema.loans).set({ status }).where(eq(schema.loans.id, id)).returning();
  await recordAudit({ action: "loan.update", entity: "loan", entityId: id, summary: `${status === "CLOSED" ? "Closed" : "Reopened"} loan "${row?.name ?? id}"`, before: { status: status === "CLOSED" ? "ACTIVE" : "CLOSED" }, after: { status } });
  revalidatePath("/loans");
  return { ok: true as const };
}

const PaymentInput = z.object({
  loanId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  interestAmount: z.number().min(0).optional(),
  accountId: z.string().uuid().optional().nullable(),
  note: z.string().max(500).optional().nullable(),
  createTransaction: z.boolean().optional(),
});
export type LoanPaymentInputT = z.infer<typeof PaymentInput>;

export async function recordLoanPayment(raw: LoanPaymentInputT) {
  const input = PaymentInput.parse(raw);
  const db = await getDb();
  const loan = await db.query.loans.findFirst({ where: eq(schema.loans.id, input.loanId) });
  if (!loan) throw new Error("Loan not found");
  const amountMinor = toMinor(input.amount);
  const interestMinor = toMinor(input.interestAmount ?? 0);
  const principalMinor = Math.max(0, amountMinor - interestMinor);
  let transactionId: string | null = null;
  const accountId = input.accountId ?? loan.accountId;
  if (input.createTransaction !== false && accountId) {
    const isBorrowed = loan.direction === "BORROWED";
    const cat = isBorrowed ? await findCategory("Loan Repayment", "EXPENSE") : await findCategory("Other Income", "INCOME");
    const res = await createTransaction({
      accountId,
      date: input.date,
      description: isBorrowed ? `Loan repayment: ${loan.name}` : `Loan repayment received: ${loan.name}`,
      merchant: loan.counterparty ?? undefined,
      amount: input.amount,
      type: isBorrowed ? "EXPENSE" : "INCOME",
      currency: loan.currency,
      categoryId: cat?.id ?? null,
      loanId: loan.id,
      notes: input.note ?? undefined,
    });
    transactionId = res.id;
  }
  const [payment] = await db.insert(schema.loanPayments).values({ loanId: loan.id, date: input.date, amountMinor, principalMinor, interestMinor, transactionId, note: input.note || null }).returning();
  await recordAudit({ action: "loan_payment.create", entity: "loan_payment", entityId: payment.id, summary: `Recorded payment of ${formatMoney(amountMinor, loan.currency)} on loan "${loan.name}" (${formatDate(input.date)})`, after: payment });
  revalidatePath("/loans");
  revalidatePath("/");
  return { ok: true as const };
}

export async function deleteLoanPayment(id: string, deleteTransaction = true) {
  const db = await getDb();
  const p = await db.query.loanPayments.findFirst({ where: eq(schema.loanPayments.id, id) });
  if (!p) return { ok: true as const };
  const loan = await db.query.loans.findFirst({ where: eq(schema.loans.id, p.loanId) });
  await db.delete(schema.loanPayments).where(eq(schema.loanPayments.id, id));
  if (deleteTransaction && p.transactionId) await db.delete(schema.transactions).where(eq(schema.transactions.id, p.transactionId));
  await recordAudit({ action: "loan_payment.delete", entity: "loan_payment", entityId: id, summary: `Deleted payment of ${formatMoney(p.amountMinor, loan?.currency ?? "")} on loan "${loan?.name ?? p.loanId}"`, before: p });
  revalidatePath("/loans");
  revalidatePath("/transactions");
  return { ok: true as const };
}
