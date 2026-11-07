import type { Loan, LoanPayment } from "@/lib/db/schema";

export type LoanWithPayments = Loan & { payments: LoanPayment[] };

export function outstandingMinor(loan: LoanWithPayments): number {
  const repaid = loan.payments.reduce((a, p) => a + p.principalMinor, 0);
  return Math.max(0, loan.principalMinor - repaid);
}

export function repaidPct(loan: LoanWithPayments): number {
  if (!loan.principalMinor) return 0;
  return Math.min(100, Math.round(((loan.principalMinor - outstandingMinor(loan)) / loan.principalMinor) * 100));
}

/** Equal-payment amortization (monthly). Returns null if the loan has no term. */
export function amortization(principalMinor: number, apr: number, termMonths: number | null | undefined, startDate: string) {
  if (!termMonths || termMonths <= 0 || principalMinor <= 0) return null;
  const r = apr / 100 / 12;
  const payment = r > 0 ? (principalMinor * r) / (1 - Math.pow(1 + r, -termMonths)) : principalMinor / termMonths;
  const rows: { n: number; date: string; payment: number; interest: number; principal: number; balance: number }[] = [];
  let balance = principalMinor;
  const start = new Date(startDate + "T00:00:00");
  for (let n = 1; n <= termMonths; n++) {
    const interest = Math.round(balance * r);
    let principal = Math.round(payment) - interest;
    if (n === termMonths || principal > balance) principal = balance;
    balance -= principal;
    const d = new Date(start.getFullYear(), start.getMonth() + n, Math.min(start.getDate(), 28));
    rows.push({ n, date: d.toISOString().slice(0, 10), payment: principal + interest, interest, principal, balance: Math.max(0, balance) });
  }
  return { payment: Math.round(payment), rows };
}

export function sumByCurrency(items: { currency: string; minor: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) out[i.currency] = (out[i.currency] ?? 0) + i.minor;
  return out;
}
