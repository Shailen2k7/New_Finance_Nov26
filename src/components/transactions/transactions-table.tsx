"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Trash2, ArrowLeftRight, Inbox, ChevronLeft, ChevronRight } from "lucide-react";
import type { Account, Category } from "@/lib/db/schema";
import type { TxnWithRelations } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/modal";
import { ColorDot, EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { setTransactionCategory, deleteTransactions, countSimilarUncategorized } from "@/lib/actions/transactions";
import { FilterBar } from "./filter-bar";
import { TransactionModal } from "./transaction-modal";
import type { Preset } from "./params";

type Props = {
  rows: TxnWithRelations[];
  total: number;
  page: number;
  pageSize: number;
  accounts: Account[];
  categories: Category[];
  baseCurrency: string;
  preset: Preset;
};

export function TransactionsTable({ rows: serverRows, total, page, pageSize, accounts, categories, baseCurrency, preset }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState(serverRows);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<TxnWithRelations | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null);
  const [similar, setSimilar] = useState<{ id: string; categoryId: string; count: number } | null>(null);
  const [bulkCategory, setBulkCategory] = useState("");

  useEffect(() => {
    setRows(serverRows);
    setSelected(new Set());
  }, [serverRows]);

  // ?new=1 opens the add modal
  useEffect(() => {
    if (sp.get("new") === "1") {
      setEditing(null);
      setModalOpen(true);
    }
  }, [sp]);

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    if (sp.get("new")) {
      const next = new URLSearchParams(sp.toString());
      next.delete("new");
      const s = next.toString();
      router.replace(s ? `${pathname}?${s}` : pathname);
    }
  };

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (t: TxnWithRelations) => {
    setEditing(t);
    setModalOpen(true);
  };

  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  const changeCategory = (t: TxnWithRelations, categoryId: string) => {
    const cat = categoryId ? catById.get(categoryId) ?? null : null;
    setRows((rs) => rs.map((r) => (r.id === t.id ? { ...r, categoryId: categoryId || null, category: cat } : r)));
    setSimilar(null);
    start(async () => {
      try {
        await setTransactionCategory([t.id], categoryId || null);
        toast.success(cat ? `Categorized as ${cat.name}` : "Category removed");
        if (cat) {
          const n = await countSimilarUncategorized(t.merchant || t.description);
          if (n > 0) setSimilar({ id: t.id, categoryId, count: n });
        }
      } catch (err) {
        toast.error("Could not update category", err instanceof Error ? err.message : String(err));
        router.refresh();
      }
    });
  };

  const applySimilar = () => {
    if (!similar) return;
    const s = similar;
    setSimilar(null);
    start(async () => {
      const res = await setTransactionCategory([s.id], s.categoryId, { applyToSimilar: true });
      toast.success(`Applied to ${res.similarUpdated} similar transaction${res.similarUpdated === 1 ? "" : "s"}`);
      router.refresh();
    });
  };

  const bulkSetCategory = (categoryId: string) => {
    if (!categoryId || selected.size === 0) return;
    const ids = Array.from(selected);
    const cat = catById.get(categoryId) ?? null;
    setRows((rs) => rs.map((r) => (selected.has(r.id) ? { ...r, categoryId, category: cat } : r)));
    setBulkCategory("");
    start(async () => {
      await setTransactionCategory(ids, categoryId);
      toast.success(`${ids.length} transaction${ids.length === 1 ? "" : "s"} categorized as ${cat?.name}`);
      setSelected(new Set());
      router.refresh();
    });
  };

  const doDelete = () => {
    if (!confirmIds) return;
    const ids = confirmIds;
    start(async () => {
      try {
        await deleteTransactions(ids);
        toast.success(`Deleted ${ids.length} transaction${ids.length === 1 ? "" : "s"}`);
        setConfirmIds(null);
        setSelected(new Set());
        router.refresh();
      } catch (err) {
        toast.error("Could not delete", err instanceof Error ? err.message : String(err));
      }
    });
  };

  const gotoPage = (p: number) => {
    const next = new URLSearchParams(sp.toString());
    if (p <= 1) next.delete("page");
    else next.set("page", String(p));
    const s = next.toString();
    router.push(s ? `${pathname}?${s}` : pathname);
  };

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const showAccount = accounts.length > 1;
  const hasFilters = ["q", "range", "from", "to", "type", "accountId", "categoryId", "min", "max", "uncategorized"].some((k) => sp.get(k));

  return (
    <div className="card overflow-hidden p-0">
      <div className="border-b border-line p-4 lg:p-5">
        <FilterBar accounts={accounts} categories={categories} preset={preset} onNew={openNew} />
      </div>

      {selected.size > 0 && (
        <div className="fade-up flex flex-wrap items-center gap-3 border-b border-line bg-primary-50 px-4 py-2.5 lg:px-5">
          <span className="text-[13px] font-medium text-ink">{selected.size} selected</span>
          <span className="text-faint">·</span>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-muted">Set category</span>
            <Select value={bulkCategory} onChange={(e) => { setBulkCategory(e.target.value); bulkSetCategory(e.target.value); }} className="h-8 w-auto min-w-[180px] py-1 text-[13px]">
              <option value="">Choose…</option>
              <optgroup label="Income">{categories.filter((c) => c.type === "INCOME").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
              <optgroup label="Expense">{categories.filter((c) => c.type === "EXPENSE").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
            </Select>
          </div>
          <span className="text-faint">·</span>
          <Button size="sm" variant="danger" onClick={() => setConfirmIds(Array.from(selected))}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-[13px] text-muted hover:text-ink">Clear selection</button>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-6 w-6" />}
          title={hasFilters ? "No transactions match these filters" : "No transactions yet"}
          description={hasFilters ? "Try widening the date range or clearing a filter." : "Add one manually or import a bank statement and let the AI do the data entry."}
          action={
            <div className="flex gap-2">
              <Button onClick={openNew}>Add transaction</Button>
              <Link href="/import" className="inline-flex h-10 items-center rounded-xl border border-line-strong bg-surface px-4 text-[14px] font-medium hover:bg-surface-2">Import statement</Link>
            </div>
          }
        />
      ) : (
        <>
        <ul className={cn("divide-y divide-line transition-opacity md:hidden", pending && "opacity-70")}>
          {rows.map((t) => (
            <li key={t.id}>
              <button onClick={() => openEdit(t)} className="flex w-full items-start gap-3 px-4 py-3 text-left active:bg-surface-2">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    {t.type === "TRANSFER" && <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-muted" />}
                    <span className="truncate text-[14px] font-medium text-ink">{t.merchant || t.description}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
                    {t.category && <ColorDot color={t.category.color} className="h-2 w-2" />}
                    <span className="truncate">{formatDate(t.date)} · {t.type === "TRANSFER" ? "Transfer" : t.category?.name ?? "Uncategorized"}</span>
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={cn("tnum block text-[14px] font-semibold", t.amountMinor > 0 ? "text-success" : "text-ink")}>{formatMoney(t.amountMinor, t.currency, { signed: true })}</span>
                  {t.currency !== baseCurrency && <span className="tnum block text-[12px] text-muted">≈ {formatMoney(t.baseAmountMinor, baseCurrency)}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className={cn("hidden overflow-x-auto transition-opacity md:block", pending && "opacity-70")}>
          <table className="table min-w-[760px] table-fixed">
            <thead>
              <tr>
                <th className="w-12"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-[var(--color-primary)]" aria-label="Select all" /></th>
                <th className="w-[112px]">Date</th>
                <th>Description</th>
                {showAccount && <th className="w-[160px]">Account</th>}
                <th className="w-[236px]">Category</th>
                <th className="w-[140px] !text-right">Amount</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const isSel = selected.has(t.id);
                const showBase = t.currency !== baseCurrency;
                const cats = categories.filter((c) => c.type === t.type);
                return (
                  <tr key={t.id} className={cn("cursor-pointer", isSel && "bg-primary-50/60")} onClick={() => openEdit(t)}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={isSel} onChange={() => toggle(t.id)} className="h-4 w-4 accent-[var(--color-primary)]" aria-label="Select row" />
                    </td>
                    <td className="tnum whitespace-nowrap text-ink-2">{formatDate(t.date)}</td>
                    <td>
                      <div className="flex min-w-0 items-center gap-2">
                        {t.type === "TRANSFER" && <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-muted" />}
                        <p className="truncate font-medium text-ink">{t.merchant || t.description}</p>
                        {t.status === "PENDING" && <Badge tone="amber">Pending</Badge>}
                      </div>
                      {t.merchant && <p className="mt-0.5 truncate text-[12px] text-muted" title={t.description}>{t.description}</p>}
                    </td>
                    {showAccount && (
                      <td>
                        <span className="flex min-w-0 items-center gap-2 text-[13px] text-ink-2">
                          <ColorDot color={t.account.color} />
                          <span className="truncate">{t.account.name}</span>
                        </span>
                      </td>
                    )}
                    <td onClick={(e) => e.stopPropagation()}>
                      {t.type === "TRANSFER" ? (
                        <span className="text-[13px] text-muted">Transfer</span>
                      ) : (
                        <div>
                          <div className="flex items-center gap-2">
                            {t.category && <ColorDot color={t.category.color} />}
                            <Select value={t.categoryId ?? ""} onChange={(e) => changeCategory(t, e.target.value)} className={cn("h-8 py-1 text-[13px]", !t.categoryId && "border-dashed text-muted")}>
                              <option value="">Uncategorized</option>
                              {cats.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </Select>
                          </div>
                          {similar?.id === t.id && (
                            <div className="fade-up mt-1.5 flex items-center gap-2 text-[12px]">
                              <span className="text-muted">Apply to {similar.count} similar?</span>
                              <button onClick={applySimilar} className="font-medium text-primary hover:underline">Yes</button>
                              <button onClick={() => setSimilar(null)} className="text-muted hover:text-ink">No</button>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="text-right">
                      <p className={cn("tnum font-semibold", t.type === "INCOME" || (t.type === "TRANSFER" && t.amountMinor > 0) ? "text-success" : "text-ink")}>
                        {formatMoney(t.amountMinor, t.currency, { signed: true })}
                      </p>
                      {showBase && <p className="tnum text-[12px] text-muted">≈ {formatMoney(t.baseAmountMinor, baseCurrency)}</p>}
                    </td>
                    <td onClick={(e) => e.stopPropagation()} className="!px-2 text-center">
                      <button onClick={() => setConfirmIds([t.id])} className="rounded-lg p-1.5 text-faint transition hover:bg-danger-50 hover:text-danger" aria-label="Delete transaction" title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-[13px] text-muted lg:px-5">
          <span>Showing <span className="tnum text-ink">{from}–{to}</span> of <span className="tnum text-ink">{total}</span></span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => gotoPage(page - 1)}><ChevronLeft className="h-4 w-4" /> Prev</Button>
            <span className="tnum px-2">Page {page} of {pages}</span>
            <Button variant="ghost" size="sm" disabled={page >= pages} onClick={() => gotoPage(page + 1)}>Next <ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      <TransactionModal open={modalOpen} onClose={closeModal} accounts={accounts} categories={categories} preset={preset} editing={editing} />
      <ConfirmDialog
        open={confirmIds !== null}
        onClose={() => setConfirmIds(null)}
        onConfirm={doDelete}
        loading={pending}
        title={`Delete ${confirmIds?.length ?? 0} transaction${(confirmIds?.length ?? 0) === 1 ? "" : "s"}?`}
        message="This permanently removes the selected transactions from your ledger. Linked loan payments are also removed."
      />
    </div>
  );
}
