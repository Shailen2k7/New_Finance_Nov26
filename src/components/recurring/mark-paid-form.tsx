"use client";
import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { fromMinor } from "@/lib/money";
import { markRecurringPaid } from "@/lib/actions/recurring";
import type { Account, RecurringPayment } from "@/lib/db/schema";

export function MarkPaidForm({ open, onClose, item, accounts }: { open: boolean; onClose: () => void; item: RecurringPayment; accounts: Account[] }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(item.nextDueDate);
  const [amount, setAmount] = useState(fromMinor(Math.abs(item.amountMinor)));
  const [accountId, setAccountId] = useState(item.accountId ?? "");
  const [createTxn, setCreateTxn] = useState(true);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      try {
        const res = await markRecurringPaid(item.id, { date, amount, accountId: accountId || undefined, createTransaction: createTxn });
        toast.success("Marked as paid", `Next due ${res.nextDueDate}`);
        onClose();
      } catch (err) {
        toast.error("Could not mark as paid", err instanceof Error ? err.message : undefined);
      }
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Mark as paid" description={item.name} size="sm" footer={
      <>
        <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="mark-paid-form" loading={pending}>Confirm</Button>
      </>
    }>
      <form id="mark-paid-form" onSubmit={submit} className="space-y-4">
        <Field label="Paid on"><Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label={`Amount (${item.currency})`}><Input type="number" step="0.01" min="0.01" required value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
        <Field label="Account">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)} required={createTxn}>
            <option value="">Select account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
          </Select>
        </Field>
        <label className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3 text-[13px] text-ink-2">
          <input type="checkbox" checked={createTxn} onChange={(e) => setCreateTxn(e.target.checked)} />
          Record as a transaction
        </label>
      </form>
    </Modal>
  );
}
