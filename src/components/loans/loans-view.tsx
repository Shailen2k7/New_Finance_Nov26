"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Landmark, MoreHorizontal, Pencil, Trash2, CheckCircle2, RotateCcw, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar, EmptyState, PageHeader, StatTile } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { deleteLoan, setLoanStatus } from "@/lib/actions/loans";
import type { Account } from "@/lib/db/schema";
import { LoanForm } from "./loan-form";
import { PaymentForm } from "./payment-form";
import { LoanDetails } from "./loan-details";
import { outstandingMinor, repaidPct, sumByCurrency, type LoanWithPayments } from "./loan-utils";

function CurrencyTotals({ totals }: { totals: Record<string, number> }) {
  const entries = Object.entries(totals);
  if (entries.length === 0) return <>—</>;
  if (entries.length === 1) return <>{formatMoney(entries[0][1], entries[0][0])}</>;
  return <span className="flex flex-col gap-0.5 text-[18px]">{entries.map(([c, v]) => <span key={c}>{formatMoney(v, c)}</span>)}</span>;
}

export function LoansView({ loans, accounts, defaultCurrency }: { loans: LoanWithPayments[]; accounts: Account[]; defaultCurrency: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [form, setForm] = useState<{ open: boolean; loan?: LoanWithPayments | null }>({ open: false });
  const [pay, setPay] = useState<LoanWithPayments | null>(null);
  const [details, setDetails] = useState<LoanWithPayments | null>(null);
  const [del, setDel] = useState<LoanWithPayments | null>(null);
  const [menu, setMenu] = useState<string | null>(null);

  useEffect(() => {
    if (params.get("new") === "1") setForm({ open: true, loan: null });
  }, [params]);
  const closeForm = () => {
    setForm({ open: false });
    if (params.get("new")) router.replace("/loans");
  };
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menu]);
  // Keep details modal in sync with fresh data
  useEffect(() => {
    if (details) setDetails(loans.find((l) => l.id === details.id) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loans]);

  const active = loans.filter((l) => l.status === "ACTIVE");
  const borrowed = sumByCurrency(active.filter((l) => l.direction === "BORROWED").map((l) => ({ currency: l.currency, minor: outstandingMinor(l) })));
  const lent = sumByCurrency(active.filter((l) => l.direction === "LENT").map((l) => ({ currency: l.currency, minor: outstandingMinor(l) })));
  const monthly = sumByCurrency(active.filter((l) => l.direction === "BORROWED" && l.paymentAmountMinor).map((l) => ({ currency: l.currency, minor: l.paymentAmountMinor! })));

  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
      } catch (err) {
        toast.error("Something went wrong", err instanceof Error ? err.message : undefined);
      }
    });

  return (
    <div className="fade-up">
      <PageHeader title="Loans" description="Track money borrowed and lent, repayments and what is still outstanding." actions={<Button onClick={() => setForm({ open: true, loan: null })}><Plus className="h-4 w-4" /> Add loan</Button>} />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile label="Borrowed balance" value={<CurrencyTotals totals={borrowed} />} sub="What we still owe" />
        <StatTile label="Lent balance" value={<CurrencyTotals totals={lent} />} sub="What is owed to us" />
        <StatTile label="Monthly repayments" value={<CurrencyTotals totals={monthly} />} sub="Sum of regular payments" />
        <StatTile label="Active loans" value={active.length} sub={`${loans.length - active.length} closed`} />
      </div>

      {loans.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Landmark className="h-6 w-6" />} title="No loans yet" description="Add a loan you have taken or given to track repayments and outstanding balances." action={<Button onClick={() => setForm({ open: true, loan: null })}><Plus className="h-4 w-4" /> Add loan</Button>} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {loans.map((loan) => {
            const out = outstandingMinor(loan);
            const pct = repaidPct(loan);
            return (
              <div key={loan.id} className="card relative cursor-pointer p-5 transition hover:border-line-strong" onClick={() => setDetails(loan)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[16px] font-semibold text-ink">{loan.name}</p>
                    <p className="truncate text-[13px] text-muted">{loan.counterparty || (loan.direction === "BORROWED" ? "Lender not set" : "Borrower not set")}</p>
                    <div className="mt-2 flex items-center gap-1.5">
                      <Badge tone={loan.direction === "BORROWED" ? "amber" : "blue"}>{loan.direction === "BORROWED" ? "Borrowed" : "Lent"}</Badge>
                      <Badge tone={loan.status === "ACTIVE" ? "green" : "gray"} dot>{loan.status === "ACTIVE" ? "Active" : "Closed"}</Badge>
                    </div>
                  </div>
                  <div className="shrink-0">
                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setMenu(menu === loan.id ? null : loan.id)} className="rounded-lg p-1.5 text-faint hover:bg-surface-2 hover:text-ink" aria-label="Actions"><MoreHorizontal className="h-4 w-4" /></button>
                      {menu === loan.id && (
                        <div className="fade-up absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-pop text-[13px]">
                          <button className="flex w-full items-center gap-2 px-3 py-2 hover:bg-surface-2" onClick={() => setPay(loan)}><Banknote className="h-4 w-4 text-muted" /> Record payment</button>
                          <button className="flex w-full items-center gap-2 px-3 py-2 hover:bg-surface-2" onClick={() => setForm({ open: true, loan })}><Pencil className="h-4 w-4 text-muted" /> Edit</button>
                          {loan.status === "ACTIVE" ? (
                            <button className="flex w-full items-center gap-2 px-3 py-2 hover:bg-surface-2" onClick={() => run(() => setLoanStatus(loan.id, "CLOSED"), "Loan closed")}><CheckCircle2 className="h-4 w-4 text-muted" /> Close loan</button>
                          ) : (
                            <button className="flex w-full items-center gap-2 px-3 py-2 hover:bg-surface-2" onClick={() => run(() => setLoanStatus(loan.id, "ACTIVE"), "Loan reopened")}><RotateCcw className="h-4 w-4 text-muted" /> Reopen</button>
                          )}
                          <button className="flex w-full items-center gap-2 px-3 py-2 text-danger hover:bg-danger-50" onClick={() => setDel(loan)}><Trash2 className="h-4 w-4" /> Delete</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <div><p className="text-[12px] text-muted">Outstanding</p><p className="tnum text-[22px] font-semibold tracking-tight">{formatMoney(out, loan.currency)}</p></div>
                  <div className="text-right"><p className="text-[12px] text-muted">Principal</p><p className="tnum text-[14px] font-medium">{formatMoney(loan.principalMinor, loan.currency)}</p></div>
                </div>
                <ProgressBar value={pct} className="mt-3" color={loan.direction === "BORROWED" ? "var(--color-warning)" : "var(--color-primary)"} />
                <p className="mt-1.5 text-[12px] text-muted">{pct}% repaid · {loan.payments.length} payment{loan.payments.length === 1 ? "" : "s"}</p>
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 text-[12px]">
                  <div><span className="text-muted">Interest</span><p className="font-medium">{Number(loan.interestRateApr)}% APR</p></div>
                  <div><span className="text-muted">Started</span><p className="font-medium">{formatDate(loan.startDate)}</p></div>
                  <div><span className="text-muted">Term</span><p className="font-medium">{loan.termMonths ? `${loan.termMonths} months` : "Open-ended"}</p></div>
                  <div><span className="text-muted">Next payment</span><p className="font-medium">{loan.paymentAmountMinor ? `${formatMoney(loan.paymentAmountMinor, loan.currency)}${loan.paymentDay ? ` on day ${loan.paymentDay}` : ""}` : loan.paymentDay ? `Day ${loan.paymentDay}` : "—"}</p></div>
                </div>
                {loan.status === "ACTIVE" && (
                  <div className="mt-4" onClick={(e) => e.stopPropagation()}>
                    <Button variant="secondary" size="sm" className="w-full" onClick={() => setPay(loan)}><Banknote className="h-4 w-4" /> Record payment</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {form.open && <LoanForm open onClose={closeForm} loan={form.loan ?? null} accounts={accounts} defaultCurrency={defaultCurrency} />}
      {pay && <PaymentForm open onClose={() => setPay(null)} loan={pay} accounts={accounts} outstandingMinor={outstandingMinor(pay)} />}
      {details && <LoanDetails open onClose={() => setDetails(null)} loan={details} />}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} loading={pending} title="Delete loan?" message={`"${del?.name}" and its payment history will be removed. Linked transactions are kept.`} onConfirm={() => del && run(async () => { await deleteLoan(del.id); setDel(null); }, "Loan deleted")} />
    </div>
  );
}
