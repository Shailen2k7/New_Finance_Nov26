"use client";
import { useState, useTransition } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { CURRENCIES, fromMinor } from "@/lib/money";
import { todayISO } from "@/lib/dates";
import { upsertRecurring, type RecurringInputT } from "@/lib/actions/recurring";
import type { Account, Category, RecurringPayment } from "@/lib/db/schema";
import { FREQ_LABEL } from "./recurring-utils";

export function RecurringForm({ open, onClose, item, accounts, categories, defaultCurrency }: { open: boolean; onClose: () => void; item?: RecurringPayment | null; accounts: Account[]; categories: Category[]; defaultCurrency: string }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [form, setForm] = useState<RecurringInputT>(() => ({
    name: item?.name ?? "",
    merchantPattern: item?.merchantPattern ?? "",
    amount: item ? fromMinor(Math.abs(item.amountMinor)) : 0,
    currency: item?.currency ?? defaultCurrency,
    type: item?.type === "INCOME" ? "INCOME" : "EXPENSE",
    frequency: item?.frequency ?? "MONTHLY",
    nextDueDate: item?.nextDueDate ?? todayISO(),
    endDate: item?.endDate ?? "",
    categoryId: item?.categoryId ?? "",
    accountId: item?.accountId ?? "",
    notes: item?.notes ?? "",
    isActive: item?.isActive ?? true,
  }));
  const set = <K extends keyof RecurringInputT>(k: K, v: RecurringInputT[K]) => setForm((f) => ({ ...f, [k]: v }));
  const cats = categories.filter((c) => c.type === form.type);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      try {
        await upsertRecurring({ ...form, merchantPattern: form.merchantPattern || null, endDate: form.endDate || null, categoryId: form.categoryId || null, accountId: form.accountId || null, notes: form.notes || null }, item?.id);
        toast.success(item ? "Recurring payment updated" : "Recurring payment added");
        onClose();
      } catch (err) {
        toast.error("Could not save", err instanceof Error ? err.message : undefined);
      }
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={item ? "Edit recurring payment" : "Add recurring payment"} size="lg" footer={
      <>
        <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="recurring-form" loading={pending}>{item ? "Save changes" : "Add"}</Button>
      </>
    }>
      <form id="recurring-form" onSubmit={submit} className="space-y-4">
        <Segmented value={form.type} onChange={(v) => { set("type", v); set("categoryId", ""); }} options={[{ value: "EXPENSE", label: "Expense" }, { value: "INCOME", label: "Income" }]} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name"><Input required value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Office rent, Notion subscription" /></Field>
          <Field label="Merchant pattern" hint="Matches statement descriptions during import"><Input value={form.merchantPattern ?? ""} onChange={(e) => set("merchantPattern", e.target.value)} placeholder="e.g. NOTION LABS" /></Field>
          <Field label="Amount"><Input type="number" step="0.01" min="0.01" required value={form.amount || ""} onChange={(e) => set("amount", Number(e.target.value))} /></Field>
          <Field label="Currency">
            <Select value={form.currency} onChange={(e) => set("currency", e.target.value)}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
            </Select>
          </Field>
          <Field label="Frequency">
            <Select value={form.frequency} onChange={(e) => set("frequency", e.target.value as RecurringInputT["frequency"])}>
              {(Object.keys(FREQ_LABEL) as RecurringInputT["frequency"][]).map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}
            </Select>
          </Field>
          <Field label="Next due date"><Input type="date" required value={form.nextDueDate} onChange={(e) => set("nextDueDate", e.target.value)} /></Field>
          <Field label="End date" hint="Optional"><Input type="date" value={form.endDate ?? ""} onChange={(e) => set("endDate", e.target.value)} /></Field>
          <Field label="Category">
            <Select value={form.categoryId ?? ""} onChange={(e) => set("categoryId", e.target.value)}>
              <option value="">Uncategorized</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Account" hint="Where payments are recorded">
            <Select value={form.accountId ?? ""} onChange={(e) => set("accountId", e.target.value)}>
              <option value="">Choose when paying</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Notes"><Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
      </form>
    </Modal>
  );
}
