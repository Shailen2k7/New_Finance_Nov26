"use client";
import { useEffect, useState, useTransition } from "react";
import type { Account } from "@/lib/db/schema";
import { upsertAccount, type AccountInputT } from "@/lib/actions/accounts";
import { CURRENCIES, fromMinor } from "@/lib/money";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export const ACCOUNT_COLORS = ["#2f7a5c", "#4fa3a8", "#5b84b1", "#8e7cc3", "#a67c9e", "#c96f5b", "#e08a3c", "#c9a227", "#7d8f69", "#94a39b", "#374151"];

type Form = {
  name: string;
  institution: string;
  type: Account["type"];
  currency: string;
  lastFour: string;
  openingBalance: string;
  openingBalanceDate: string;
  color: string;
};

const emptyForm = (currency: string): Form => ({ name: "", institution: "", type: "BANK", currency, lastFour: "", openingBalance: "0", openingBalanceDate: "", color: ACCOUNT_COLORS[0] });

export function AccountModal({ open, account, onClose, defaultCurrency }: { open: boolean; account: Account | null; onClose: () => void; defaultCurrency: string }) {
  const [form, setForm] = useState<Form>(() => emptyForm(defaultCurrency));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      account
        ? {
            name: account.name,
            institution: account.institution ?? "",
            type: account.type,
            currency: account.currency,
            lastFour: account.lastFour ?? "",
            openingBalance: String(fromMinor(account.openingBalanceMinor)),
            openingBalanceDate: account.openingBalanceDate ?? "",
            color: account.color,
          }
        : emptyForm(defaultCurrency),
    );
  }, [open, account]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const opening = Number(form.openingBalance || 0);
    if (!form.name.trim()) return setError("Name is required");
    if (!Number.isFinite(opening)) return setError("Opening balance must be a number");
    const input: AccountInputT = {
      name: form.name,
      institution: form.institution || null,
      type: form.type,
      currency: form.currency,
      lastFour: form.lastFour || null,
      openingBalance: opening,
      openingBalanceDate: form.openingBalanceDate || null,
      color: form.color,
    };
    start(async () => {
      try {
        await upsertAccount(input, account?.id);
        toast.success(account ? "Account updated" : "Account added", form.name);
        onClose();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={account ? "Edit account" : "Add account"}
      description="Accounts hold transactions in their own currency; totals are converted to your base currency."
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="account-form" loading={pending}>{account ? "Save changes" : "Add account"}</Button>
        </>
      }
    >
      <form id="account-form" onSubmit={submit} className="space-y-4">
        <Field label="Account name" error={error ?? undefined}>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Business Current Account" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Institution">
            <Input value={form.institution} onChange={(e) => set("institution", e.target.value)} placeholder="e.g. HSBC, Wise, Stripe" />
          </Field>
          <Field label="Type">
            <Select value={form.type} onChange={(e) => set("type", e.target.value as Account["type"])}>
              <option value="BANK">Bank account</option>
              <option value="CARD">Credit / debit card</option>
              <option value="SAVINGS">Savings</option>
              <option value="WALLET">Wallet / payment platform</option>
              <option value="CASH">Cash</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Currency">
            <Select value={form.currency} onChange={(e) => set("currency", e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Last 4 digits" hint="Optional, helps match statements">
            <Input value={form.lastFour} onChange={(e) => set("lastFour", e.target.value.replace(/[^0-9A-Za-z]/g, "").slice(0, 8))} placeholder="1234" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Opening balance" hint="Balance before the first recorded transaction">
            <Input type="number" step="0.01" value={form.openingBalance} onChange={(e) => set("openingBalance", e.target.value)} />
          </Field>
          <Field label="Opening balance date">
            <Input type="date" value={form.openingBalanceDate} onChange={(e) => set("openingBalanceDate", e.target.value)} />
          </Field>
        </div>
        <Field label="Color">
          <div className="flex flex-wrap gap-2">
            {ACCOUNT_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => set("color", c)} className={cn("h-8 w-8 rounded-full border-2 transition", form.color === c ? "border-ink scale-110" : "border-transparent hover:scale-105")} style={{ background: c }} aria-label={c} />
            ))}
          </div>
        </Field>
      </form>
    </Modal>
  );
}
