"use client";
import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { fromMinor, formatMoney } from "@/lib/money";
import { todayISO } from "@/lib/dates";
import { recordLoanPayment } from "@/lib/actions/loans";
import type { Account, Loan } from "@/lib/db/schema";

export function PaymentForm({ open, onClose, loan, accounts, outstandingMinor }: { open: boolean; onClose: () => void; loan: Loan; accounts: Account[]; outstandingMinor: number }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState<number>(loan.paymentAmountMinor ? fromMinor(loan.paymentAmountMinor) : 0);
  const [interest, setInterest] = useState<number>(0);
  const [accountId, setAccountId] = useState(loan.accountId ?? "");
  const [note, setNote] = useState("");
  const [createTxn, setCreateTxn] = useState(true);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      try {
        await recordLoanPayment({ loanId: loan.id, date, amount, interestAmount: interest || 0, accountId: accountId || null, note: note || null, createTransaction: createTxn });
        toast.success("Payment recorded");
        onClose();
      } catch (err) {
        toast.error("Could not record payment", err instanceof Error ? err.message : undefined);
      }
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Record payment" description={`${loan.name} · outstanding ${formatMoney(outstandingMinor, loan.currency)}`} footer={
      <>
        <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="payment-form" loading={pending}>Record payment</Button>
      </>
    }>
      <form id="payment-form" onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Date"><Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label={`Amount (${loan.currency})`}><Input type="number" step="0.01" min="0.01" required value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
          <Field label="Interest portion" hint="Optional — the rest reduces principal"><Input type="number" step="0.01" min="0" value={interest || ""} onChange={(e) => setInterest(Number(e.target.value))} /></Field>
          <Field label="Account">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">No account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></Field>
        <label className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3 text-[13px] text-ink-2">
          <input type="checkbox" checked={createTxn} disabled={!accountId} onChange={(e) => setCreateTxn(e.target.checked)} />
          Also record as a transaction{!accountId && <span className="text-muted">(needs an account)</span>}
        </label>
      </form>
    </Modal>
  );
}
