"use client";
import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { CURRENCIES, fromMinor } from "@/lib/money";
import { todayISO } from "@/lib/dates";
import { upsertLoan, type LoanInputT } from "@/lib/actions/loans";
import type { Account, Loan } from "@/lib/db/schema";

export function LoanForm({ open, onClose, loan, accounts, defaultCurrency }: { open: boolean; onClose: () => void; loan?: Loan | null; accounts: Account[]; defaultCurrency: string }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [form, setForm] = useState<LoanInputT>(() => ({
    name: loan?.name ?? "",
    counterparty: loan?.counterparty ?? "",
    direction: loan?.direction ?? "BORROWED",
    principal: loan ? fromMinor(loan.principalMinor) : 0,
    currency: loan?.currency ?? defaultCurrency,
    interestRateApr: loan ? Number(loan.interestRateApr) : 0,
    startDate: loan?.startDate ?? todayISO(),
    termMonths: loan?.termMonths ?? null,
    paymentAmount: loan?.paymentAmountMinor ? fromMinor(loan.paymentAmountMinor) : null,
    paymentDay: loan?.paymentDay ?? null,
    accountId: loan?.accountId ?? "",
    notes: loan?.notes ?? "",
    createDisbursementTransaction: false,
  }));
  const set = <K extends keyof LoanInputT>(k: K, v: LoanInputT[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      try {
        await upsertLoan({ ...form, accountId: form.accountId || null, counterparty: form.counterparty || null, notes: form.notes || null }, loan?.id);
        toast.success(loan ? "Loan updated" : "Loan added");
        onClose();
      } catch (err) {
        toast.error("Could not save loan", err instanceof Error ? err.message : undefined);
      }
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={loan ? "Edit loan" : "Add loan"} size="lg" footer={
      <>
        <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="loan-form" loading={pending}>{loan ? "Save changes" : "Add loan"}</Button>
      </>
    }>
      <form id="loan-form" onSubmit={submit} className="space-y-4">
        <Segmented value={form.direction} onChange={(v) => set("direction", v)} options={[{ value: "BORROWED", label: "We borrowed" }, { value: "LENT", label: "We lent" }]} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Loan name"><Input required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Startup loan" /></Field>
          <Field label={form.direction === "BORROWED" ? "Lender" : "Borrower"}><Input value={form.counterparty ?? ""} onChange={(e) => set("counterparty", e.target.value)} placeholder="Bank or person" /></Field>
          <Field label="Principal"><Input type="number" step="0.01" min="0.01" required value={form.principal || ""} onChange={(e) => set("principal", Number(e.target.value))} /></Field>
          <Field label="Currency">
            <Select value={form.currency} onChange={(e) => set("currency", e.target.value)}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
            </Select>
          </Field>
          <Field label="Interest rate (APR %)"><Input type="number" step="0.01" min="0" max="100" value={form.interestRateApr ?? 0} onChange={(e) => set("interestRateApr", Number(e.target.value))} /></Field>
          <Field label="Start date"><Input type="date" required value={form.startDate} onChange={(e) => set("startDate", e.target.value)} /></Field>
          <Field label="Term (months)" hint="Optional"><Input type="number" min="1" value={form.termMonths ?? ""} onChange={(e) => set("termMonths", e.target.value ? Number(e.target.value) : null)} /></Field>
          <Field label="Regular payment amount" hint="Optional"><Input type="number" step="0.01" min="0" value={form.paymentAmount ?? ""} onChange={(e) => set("paymentAmount", e.target.value ? Number(e.target.value) : null)} /></Field>
          <Field label="Payment day of month" hint="Optional"><Input type="number" min="1" max="31" value={form.paymentDay ?? ""} onChange={(e) => set("paymentDay", e.target.value ? Number(e.target.value) : null)} /></Field>
          <Field label="Linked account" hint="Payments are recorded here">
            <Select value={form.accountId ?? ""} onChange={(e) => set("accountId", e.target.value)}>
              <option value="">No account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Notes"><Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
        {!loan && (
          <label className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-3 text-[13px] text-ink-2">
            <input type="checkbox" className="mt-0.5" checked={!!form.createDisbursementTransaction} disabled={!form.accountId} onChange={(e) => set("createDisbursementTransaction", e.target.checked)} />
            <span>Record the disbursement as a transaction in this account{!form.accountId && <span className="text-muted"> (select a linked account first)</span>}</span>
          </label>
        )}
      </form>
    </Modal>
  );
}
