"use client";
import { useMemo, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { deleteLoanPayment } from "@/lib/actions/loans";
import { amortization, outstandingMinor, repaidPct, type LoanWithPayments } from "./loan-utils";

export function LoanDetails({ open, onClose, loan }: { open: boolean; onClose: () => void; loan: LoanWithPayments }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [del, setDel] = useState<string | null>(null);
  const outstanding = outstandingMinor(loan);
  const schedule = useMemo(() => amortization(loan.principalMinor, Number(loan.interestRateApr), loan.termMonths, loan.startDate), [loan]);
  const paidCount = loan.payments.length;
  const payments = [...loan.payments].sort((a, b) => (a.date < b.date ? 1 : -1));

  const removePayment = (id: string) => {
    start(async () => {
      try {
        await deleteLoanPayment(id, true);
        toast.success("Payment removed");
        setDel(null);
      } catch (err) {
        toast.error("Could not delete payment", err instanceof Error ? err.message : undefined);
      }
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={loan.name} description={loan.counterparty ?? undefined} size="xl">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-surface-2 p-4"><p className="text-[12px] text-muted">Principal</p><p className="tnum mt-1 text-[20px] font-semibold">{formatMoney(loan.principalMinor, loan.currency)}</p></div>
        <div className="rounded-xl border border-line bg-surface-2 p-4"><p className="text-[12px] text-muted">Outstanding</p><p className="tnum mt-1 text-[20px] font-semibold">{formatMoney(outstanding, loan.currency)}</p></div>
        <div className="rounded-xl border border-line bg-surface-2 p-4"><p className="text-[12px] text-muted">Repaid</p><p className="tnum mt-1 text-[20px] font-semibold">{repaidPct(loan)}%</p><ProgressBar value={repaidPct(loan)} className="mt-2" /></div>
      </div>

      <h4 className="mb-2 mt-6 text-[14px] font-semibold">Payment history <span className="ml-1 text-[12px] font-normal text-muted">{paidCount} payment{paidCount === 1 ? "" : "s"}</span></h4>
      {payments.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line p-6 text-center text-[13px] text-muted">No payments recorded yet.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="table">
            <thead><tr><th>Date</th><th className="text-right">Amount</th><th className="text-right">Principal</th><th className="text-right">Interest</th><th>Note</th><th></th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>{formatDate(p.date)}</td>
                  <td className="tnum text-right">{formatMoney(p.amountMinor, loan.currency)}</td>
                  <td className="tnum text-right">{formatMoney(p.principalMinor, loan.currency)}</td>
                  <td className="tnum text-right text-muted">{formatMoney(p.interestMinor, loan.currency)}</td>
                  <td className="text-muted">{p.note ?? ""}</td>
                  <td className="text-right"><button onClick={() => setDel(p.id)} className="rounded-lg p-1.5 text-faint hover:bg-danger-50 hover:text-danger" aria-label="Delete payment"><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h4 className="mb-2 mt-6 text-[14px] font-semibold">Projection</h4>
      {schedule ? (
        <>
          <p className="mb-3 text-[13px] text-muted">Equal monthly payment of <span className="tnum font-medium text-ink">{formatMoney(schedule.payment, loan.currency)}</span> over {loan.termMonths} months at {Number(loan.interestRateApr)}% APR. <Badge tone="gray" className="ml-1">Estimate</Badge></p>
          <div className="max-h-72 overflow-auto rounded-xl border border-line">
            <table className="table">
              <thead><tr><th>#</th><th>Date</th><th className="text-right">Payment</th><th className="text-right">Interest</th><th className="text-right">Principal</th><th className="text-right">Balance</th></tr></thead>
              <tbody>
                {schedule.rows.map((r) => (
                  <tr key={r.n} className={r.n <= paidCount ? "opacity-50" : ""}>
                    <td className="text-muted">{r.n}</td>
                    <td>{formatDate(r.date)}</td>
                    <td className="tnum text-right">{formatMoney(r.payment, loan.currency)}</td>
                    <td className="tnum text-right text-muted">{formatMoney(r.interest, loan.currency)}</td>
                    <td className="tnum text-right">{formatMoney(r.principal, loan.currency)}</td>
                    <td className="tnum text-right">{formatMoney(r.balance, loan.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="rounded-xl border border-line bg-surface-2 p-4 text-[13px] text-muted">Remaining to repay: <span className="tnum font-medium text-ink">{formatMoney(outstanding, loan.currency)}</span>. Add a term and interest rate to see a payment schedule.</p>
      )}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => del && removePayment(del)} loading={pending} title="Delete payment?" message="This removes the payment and its linked transaction." />
    </Modal>
  );
}
