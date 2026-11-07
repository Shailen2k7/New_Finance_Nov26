"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Account, Category } from "@/lib/db/schema";
import type { TxnWithRelations } from "@/lib/queries";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { CURRENCIES, currencyInfo } from "@/lib/money";
import { todayISO } from "@/lib/dates";
import { createTransaction, updateTransaction, type TxnInputT } from "@/lib/actions/transactions";
import type { Preset } from "./params";

type TxnType = "INCOME" | "EXPENSE" | "TRANSFER";

type FormState = {
  type: TxnType;
  flow: "IN" | "OUT";
  amount: string;
  currency: string;
  accountId: string;
  date: string;
  description: string;
  merchant: string;
  categoryId: string;
  reference: string;
  notes: string;
  status: "CLEARED" | "PENDING";
};

function initial(preset: Preset, accounts: Account[], editing?: TxnWithRelations | null): FormState {
  if (editing) {
    return {
      type: editing.type,
      flow: editing.amountMinor >= 0 ? "IN" : "OUT",
      amount: (Math.abs(editing.amountMinor) / 100).toFixed(2),
      currency: editing.currency,
      accountId: editing.accountId,
      date: editing.date,
      description: editing.description,
      merchant: editing.merchant ?? "",
      categoryId: editing.categoryId ?? "",
      reference: editing.reference ?? "",
      notes: editing.notes ?? "",
      status: editing.status,
    };
  }
  const acct = accounts[0];
  return {
    type: preset === "ALL" ? "EXPENSE" : preset,
    flow: "OUT",
    amount: "",
    currency: acct?.currency ?? "USD",
    accountId: acct?.id ?? "",
    date: todayISO(),
    description: "",
    merchant: "",
    categoryId: "",
    reference: "",
    notes: "",
    status: "CLEARED",
  };
}

export function TransactionModal({ open, onClose, accounts, categories, preset, editing }: { open: boolean; onClose: () => void; accounts: Account[]; categories: Category[]; preset: Preset; editing?: TxnWithRelations | null }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [form, setForm] = useState<FormState>(() => initial(preset, accounts, editing));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [currencyTouched, setCurrencyTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial(preset, accounts, editing));
      setErrors({});
      setCurrencyTouched(Boolean(editing));
    }
  }, [open, editing, preset, accounts]);

  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));

  const visibleCategories = useMemo(() => categories.filter((c) => c.type === form.type), [categories, form.type]);
  const typeLocked = preset !== "ALL";

  const onAccountChange = (id: string) => {
    const a = accounts.find((x) => x.id === id);
    patch({ accountId: id, ...(a && !currencyTouched ? { currency: a.currency } : {}) });
  };

  const validate = () => {
    const e: Partial<Record<keyof FormState, string>> = {};
    const amt = Number(form.amount);
    if (!form.amount || !Number.isFinite(amt) || amt <= 0) e.amount = "Enter an amount greater than 0";
    if (!form.accountId) e.accountId = "Choose an account";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) e.date = "Enter a valid date";
    if (!form.description.trim()) e.description = "Add a short description";
    if (!form.currency) e.currency = "Choose a currency";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = () => {
    if (!validate()) return;
    const input: TxnInputT = {
      accountId: form.accountId,
      date: form.date,
      description: form.description.trim(),
      merchant: form.merchant.trim() || null,
      amount: Number(form.amount),
      type: form.type,
      flow: form.type === "TRANSFER" ? form.flow : undefined,
      currency: form.currency,
      categoryId: form.type === "TRANSFER" ? null : form.categoryId || null,
      reference: form.reference.trim() || null,
      notes: form.notes.trim() || null,
      status: form.status,
    };
    start(async () => {
      try {
        if (editing) {
          await updateTransaction(editing.id, input);
          toast.success("Transaction updated");
        } else {
          await createTransaction(input);
          toast.success("Transaction added", `${form.description.trim()} · ${currencyInfo(form.currency).symbol}${Number(form.amount).toFixed(2)}`);
        }
        onClose();
        router.refresh();
      } catch (err) {
        toast.error("Could not save transaction", err instanceof Error ? err.message : String(err));
      }
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey || (e.target as HTMLElement).tagName !== "TEXTAREA")) {
      e.preventDefault();
      submit();
    }
  };

  const typeOptions: { value: TxnType; label: string }[] = [
    { value: "INCOME", label: "Income" },
    { value: "EXPENSE", label: "Expense" },
    { value: "TRANSFER", label: "Transfer" },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit transaction" : `Add ${form.type === "INCOME" ? "income" : form.type === "EXPENSE" ? "expense" : "transfer"}`}
      description={editing ? undefined : "Press Enter to save"}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={submit} loading={pending}>{editing ? "Save changes" : "Add transaction"}</Button>
        </>
      }
    >
      <div className="space-y-5" onKeyDown={onKeyDown}>
        {!typeLocked && (
          <Segmented value={form.type} onChange={(t) => patch({ type: t, categoryId: "" })} options={typeOptions} />
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_140px]">
          <Field label="Amount" error={errors.amount}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-muted">{currencyInfo(form.currency).symbol}</span>
              <Input type="number" inputMode="decimal" min={0} step="0.01" value={form.amount} onChange={(e) => patch({ amount: e.target.value })} placeholder="0.00" autoFocus className="tnum h-14 pl-10 text-[24px] font-semibold" />
            </div>
          </Field>
          <Field label="Currency" error={errors.currency}>
            <Select value={form.currency} onChange={(e) => { setCurrencyTouched(true); patch({ currency: e.target.value }); }} className="h-14">
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.code} · {c.symbol}</option>
              ))}
            </Select>
          </Field>
        </div>
        {form.type === "TRANSFER" && (
          <Field label="Direction">
            <Segmented value={form.flow} onChange={(f) => patch({ flow: f })} options={[{ value: "IN", label: "Money in" }, { value: "OUT", label: "Money out" }]} />
          </Field>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Account" error={errors.accountId}>
            <Select value={form.accountId} onChange={(e) => onAccountChange(e.target.value)}>
              {accounts.length === 0 && <option value="">No accounts — add one in Accounts</option>}
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
              ))}
            </Select>
          </Field>
          <Field label="Date" error={errors.date}>
            <Input type="date" value={form.date} onChange={(e) => patch({ date: e.target.value })} />
          </Field>
        </div>
        <Field label="Description" error={errors.description}>
          <Input value={form.description} onChange={(e) => patch({ description: e.target.value })} placeholder={form.type === "INCOME" ? "e.g. Global Talent Visa consultation — Client A" : "e.g. Google Workspace subscription"} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Merchant / Payee" hint="Used to remember categories for future imports">
            <Input value={form.merchant} onChange={(e) => patch({ merchant: e.target.value })} placeholder="Optional" />
          </Field>
          {form.type !== "TRANSFER" ? (
            <Field label="Category">
              <Select value={form.categoryId} onChange={(e) => patch({ categoryId: e.target.value })}>
                <option value="">Uncategorized</option>
                {visibleCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Status">
              <Select value={form.status} onChange={(e) => patch({ status: e.target.value as FormState["status"] })}>
                <option value="CLEARED">Cleared</option>
                <option value="PENDING">Pending</option>
              </Select>
            </Field>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Reference">
            <Input value={form.reference} onChange={(e) => patch({ reference: e.target.value })} placeholder="Invoice no., cheque no.…" />
          </Field>
          {form.type !== "TRANSFER" && (
            <Field label="Status">
              <Select value={form.status} onChange={(e) => patch({ status: e.target.value as FormState["status"] })}>
                <option value="CLEARED">Cleared</option>
                <option value="PENDING">Pending</option>
              </Select>
            </Field>
          )}
        </div>
        <Field label="Notes">
          <Textarea value={form.notes} onChange={(e) => patch({ notes: e.target.value })} placeholder="Anything useful for later" />
        </Field>
      </div>
    </Modal>
  );
}
