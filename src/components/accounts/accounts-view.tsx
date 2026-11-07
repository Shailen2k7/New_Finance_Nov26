"use client";
import { useState, useTransition } from "react";
import { Wallet, Plus, Pencil, Archive, ArchiveRestore, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import type { Account } from "@/lib/db/schema";
import { archiveAccount, deleteAccount } from "@/lib/actions/accounts";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/modal";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { AccountModal } from "./account-modal";
import { cn } from "@/lib/utils";

export type AccountRow = Account & { balanceMinor: number; txnCount: number };

const TYPE_LABEL: Record<Account["type"], string> = { BANK: "Bank", CARD: "Card", CASH: "Cash", WALLET: "Wallet", SAVINGS: "Savings" };

export function AccountsView({ accounts, baseCurrency }: { accounts: AccountRow[]; baseCurrency: string }) {
  const [editing, setEditing] = useState<AccountRow | null | "new">(null);
  const [deleting, setDeleting] = useState<AccountRow | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();

  const active = accounts.filter((a) => !a.isArchived);
  const archived = accounts.filter((a) => a.isArchived);

  const onArchive = (a: AccountRow) =>
    start(async () => {
      try {
        await archiveAccount(a.id, !a.isArchived);
        toast.success(a.isArchived ? "Account restored" : "Account archived", a.name);
      } catch (e) {
        toast.error("Could not update account", (e as Error).message);
      }
    });

  const onDelete = () => {
    if (!deleting) return;
    const a = deleting;
    start(async () => {
      try {
        await deleteAccount(a.id);
        toast.success("Account deleted", `${a.name} and its ${a.txnCount} transactions were removed`);
        setDeleting(null);
      } catch (e) {
        toast.error("Could not delete account", (e as Error).message);
      }
    });
  };

  const card = (a: AccountRow) => (
    <div key={a.id} className="card fade-up relative overflow-hidden p-5">
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: a.color }} />
      <div className="flex items-start justify-between gap-3 pl-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[16px] font-semibold text-ink">{a.name}</h3>
            <Badge tone="blue">{TYPE_LABEL[a.type]}</Badge>
            {a.isArchived && <Badge tone="amber">Archived</Badge>}
          </div>
          <p className="mt-0.5 text-[13px] text-muted">
            {a.institution || "No institution"}
            {a.lastFour && <span className="ml-2 tnum">•••• {a.lastFour}</span>}
          </p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
          <Wallet className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-5 pl-2">
        <p className="text-[12px] text-muted">Current balance</p>
        <p className={cn("tnum mt-0.5 text-[24px] font-semibold tracking-tight", a.balanceMinor < 0 ? "text-danger" : "text-ink")}>{formatMoney(a.balanceMinor, a.currency)}</p>
        <p className="mt-1 text-[12px] text-muted">
          {a.txnCount} transaction{a.txnCount === 1 ? "" : "s"} · {a.currency}
          {a.openingBalanceDate && <span> · opened {formatDate(a.openingBalanceDate)}</span>}
        </p>
      </div>
      <div className="mt-4 flex items-center gap-1.5 border-t border-line pl-2 pt-3">
        <Button size="sm" variant="ghost" onClick={() => setEditing(a)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
        <Button size="sm" variant="ghost" onClick={() => onArchive(a)} disabled={pending}>
          {a.isArchived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />} {a.isArchived ? "Restore" : "Archive"}
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto text-danger hover:bg-danger-50" onClick={() => setDeleting(a)}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader title="Accounts" description="Bank accounts, cards and wallets that hold your business money." actions={<Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add account</Button>} />
      {active.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Wallet className="h-5 w-5" />} title="No accounts yet" description="Add your first bank account to start recording and importing transactions." action={<Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add account</Button>} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{active.map(card)}</div>
      )}
      {archived.length > 0 && (
        <div className="mt-8">
          <button onClick={() => setShowArchived((v) => !v)} className="mb-3 flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
            {showArchived ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Archived accounts ({archived.length})
          </button>
          {showArchived && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{archived.map(card)}</div>}
        </div>
      )}
      <AccountModal open={editing !== null} account={editing === "new" ? null : editing} onClose={() => setEditing(null)} defaultCurrency={baseCurrency} />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={onDelete}
        loading={pending}
        title="Delete account?"
        message={deleting ? `This permanently deletes "${deleting.name}" and ALL ${deleting.txnCount} transactions recorded in it. This cannot be undone. If you only want to hide it, archive it instead.` : ""}
        confirmLabel="Delete account and transactions"
      />
    </div>
  );
}
