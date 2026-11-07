"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Pencil, Trash2, Tags, TrendingUp, TrendingDown } from "lucide-react";
import type { Category } from "@/lib/db/schema";
import { deleteCategory } from "@/lib/actions/categories";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/modal";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { CategoryModal } from "./category-modal";
import { iconFor } from "./icons";

export type CategoryRow = Category & { count: number; totalMinor: number };

export function CategoriesView({ categories, baseCurrency, uncategorizedCount }: { categories: CategoryRow[]; baseCurrency: string; uncategorizedCount: number }) {
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [creating, setCreating] = useState<"INCOME" | "EXPENSE" | null>(null);
  const [deleting, setDeleting] = useState<CategoryRow | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();

  const onDelete = () => {
    if (!deleting) return;
    const c = deleting;
    start(async () => {
      try {
        await deleteCategory(c.id);
        toast.success("Category deleted", c.count ? `${c.count} transactions are now uncategorized` : c.name);
        setDeleting(null);
      } catch (e) {
        toast.error("Could not delete category", (e as Error).message);
      }
    });
  };

  const column = (type: "INCOME" | "EXPENSE") => {
    const list = categories.filter((c) => c.type === type);
    const Icon = type === "INCOME" ? TrendingUp : TrendingDown;
    return (
      <div className="card p-0">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className={type === "INCOME" ? "flex h-8 w-8 items-center justify-center rounded-lg bg-success-50 text-success" : "flex h-8 w-8 items-center justify-center rounded-lg bg-danger-50 text-danger"}>
              <Icon className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-[16px] font-semibold text-ink">{type === "INCOME" ? "Income" : "Expense"} categories</h3>
              <p className="text-[12px] text-muted">{list.length} categories</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setCreating(type)}><Plus className="h-3.5 w-3.5" /> Add</Button>
        </div>
        {list.length === 0 ? (
          <EmptyState icon={<Tags className="h-5 w-5" />} title="No categories" action={<Button size="sm" onClick={() => setCreating(type)}>Add category</Button>} />
        ) : (
          <ul className="divide-y divide-line">
            {list.map((c) => {
              const CIcon = iconFor(c.icon);
              return (
                <li key={c.id} className="group flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: c.color + "1a", color: c.color }}>
                    <CIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-ink">{c.name}</p>
                    <p className="text-[12px] text-muted">{c.count} transaction{c.count === 1 ? "" : "s"}</p>
                  </div>
                  <span className="tnum shrink-0 text-[14px] font-medium text-ink">{formatMoney(Math.abs(c.totalMinor), baseCurrency)}</span>
                  <div className="flex shrink-0 items-center gap-0.5 transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                    <button onClick={() => setEditing(c)} className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => setDeleting(c)} className="rounded-lg p-1.5 text-muted hover:bg-danger-50 hover:text-danger" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="Categories"
        description="Organise income and expenses. The AI importer learns which category each merchant belongs to."
        actions={<Button onClick={() => setCreating("EXPENSE")}><Plus className="h-4 w-4" /> Add category</Button>}
      />
      {uncategorizedCount > 0 && (
        <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-warning/30 bg-warning-50 px-5 py-3.5 text-[14px]">
          <span className="text-ink-2"><span className="font-medium text-ink">{uncategorizedCount}</span> transaction{uncategorizedCount === 1 ? " is" : "s are"} uncategorized.</span>
          <Link href="/transactions?uncategorized=1" className="font-medium text-primary hover:underline">Review now →</Link>
        </div>
      )}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {column("INCOME")}
        {column("EXPENSE")}
      </div>
      <CategoryModal open={editing !== null || creating !== null} category={editing} defaultType={creating ?? "EXPENSE"} onClose={() => { setEditing(null); setCreating(null); }} />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={onDelete}
        loading={pending}
        title="Delete category?"
        message={deleting ? `"${deleting.name}" will be removed. ${deleting.count ? `Its ${deleting.count} transactions will be kept but become uncategorized.` : "No transactions use it."}` : ""}
        confirmLabel="Delete category"
      />
    </div>
  );
}
