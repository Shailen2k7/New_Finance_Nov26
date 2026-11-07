"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X, Download, Plus, SlidersHorizontal } from "lucide-react";
import type { Account, Category } from "@/lib/db/schema";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RANGE_OPTIONS, type Preset } from "./params";

export function FilterBar({ accounts, categories, preset, onNew }: { accounts: Account[]; categories: Category[]; preset: Preset; onNew: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [min, setMin] = useState(sp.get("min") ?? "");
  const [max, setMax] = useState(sp.get("max") ?? "");
  const [more, setMore] = useState(Boolean(sp.get("min") || sp.get("max") || sp.get("uncategorized")));
  const first = useRef(true);

  const range = sp.get("range") ?? (sp.get("from") || sp.get("to") ? "custom" : "all");

  const set = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === "") next.delete(k);
        else next.set(k, v);
      }
      next.delete("page");
      const s = next.toString();
      router.push(s ? `${pathname}?${s}` : pathname);
    },
    [router, pathname, sp],
  );

  // Debounced search + amounts
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      const patch: Record<string, string | undefined> = {};
      if ((sp.get("q") ?? "") !== q) patch.q = q || undefined;
      if ((sp.get("min") ?? "") !== min) patch.min = min || undefined;
      if ((sp.get("max") ?? "") !== max) patch.max = max || undefined;
      if (Object.keys(patch).length) set(patch);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, min, max]);

  const grouped = useMemo(() => {
    const inc = categories.filter((c) => c.type === "INCOME");
    const exp = categories.filter((c) => c.type === "EXPENSE");
    if (preset === "INCOME") return { INCOME: inc } as Record<string, Category[]>;
    if (preset === "EXPENSE") return { EXPENSE: exp } as Record<string, Category[]>;
    return { INCOME: inc, EXPENSE: exp } as Record<string, Category[]>;
  }, [categories, preset]);

  const hasFilters = ["q", "range", "from", "to", "type", "accountId", "categoryId", "min", "max", "uncategorized"].some((k) => sp.get(k));
  const exportHref = `/api/export/transactions?${new URLSearchParams({ ...Object.fromEntries(sp.entries()), preset }).toString()}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 max-sm:basis-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search transactions…" className="pl-9" />
        </div>
        <Select value={range} onChange={(e) => (e.target.value === "custom" ? set({ range: "custom" }) : set({ range: e.target.value === "all" ? undefined : e.target.value, from: undefined, to: undefined }))} className="w-auto min-w-[150px] max-sm:w-[calc(50%-4px)] max-sm:min-w-0">
          {RANGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
        {range === "custom" && (
          <div className="flex items-center gap-1.5 max-sm:w-full">
            <Input type="date" value={sp.get("from") ?? ""} onChange={(e) => set({ from: e.target.value || undefined, range: "custom" })} className="w-auto max-sm:min-w-0 max-sm:flex-1" />
            <span className="text-faint">–</span>
            <Input type="date" value={sp.get("to") ?? ""} onChange={(e) => set({ to: e.target.value || undefined, range: "custom" })} className="w-auto max-sm:min-w-0 max-sm:flex-1" />
          </div>
        )}
        <Select value={sp.get("accountId") ?? ""} onChange={(e) => set({ accountId: e.target.value || undefined })} className="w-auto min-w-[150px] max-sm:w-[calc(50%-4px)] max-sm:min-w-0">
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
        <Select value={sp.get("categoryId") ?? ""} onChange={(e) => set({ categoryId: e.target.value || undefined })} className="w-auto min-w-[160px] max-sm:w-[calc(50%-4px)] max-sm:min-w-0">
          <option value="">All categories</option>
          {Object.entries(grouped).map(([type, list]) => (
            <optgroup key={type} label={type === "INCOME" ? "Income" : "Expense"}>
              {list.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </optgroup>
          ))}
        </Select>
        {preset === "ALL" && (
          <Select value={sp.get("type") ?? ""} onChange={(e) => set({ type: e.target.value || undefined })} className="w-auto min-w-[120px] max-sm:w-[calc(50%-4px)] max-sm:min-w-0">
            <option value="">All types</option>
            <option value="INCOME">Income</option>
            <option value="EXPENSE">Expense</option>
            <option value="TRANSFER">Transfer</option>
          </Select>
        )}
        <Button variant="outline" onClick={() => setMore((v) => !v)} className={cn(more && "bg-surface-2")} title="More filters">
          <SlidersHorizontal className="h-4 w-4" /> <span className="hidden md:inline">More</span>
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <a href={exportHref} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface px-4 text-[14px] font-medium text-ink hover:bg-surface-2">
            <Download className="h-4 w-4" /> <span className="hidden sm:inline">Export CSV</span>
          </a>
          <Button onClick={onNew}>
            <Plus className="h-4 w-4" /> Add {preset === "INCOME" ? "Income" : preset === "EXPENSE" ? "Expense" : "Transaction"}
          </Button>
        </div>
      </div>
      {more && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
          <span className="text-[13px] text-muted">Amount</span>
          <Input type="number" min={0} step="0.01" value={min} onChange={(e) => setMin(e.target.value)} placeholder="Min" className="w-28" />
          <span className="text-faint">–</span>
          <Input type="number" min={0} step="0.01" value={max} onChange={(e) => setMax(e.target.value)} placeholder="Max" className="w-28" />
          <label className="ml-2 flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
            <input type="checkbox" checked={sp.get("uncategorized") === "1"} onChange={(e) => set({ uncategorized: e.target.checked ? "1" : undefined })} className="h-4 w-4 rounded border-line-strong accent-[var(--color-primary)]" />
            Uncategorized only
          </label>
          <span className="ml-auto text-[13px] text-muted">Sort</span>
          <Select value={sp.get("sort") ?? "date_desc"} onChange={(e) => set({ sort: e.target.value === "date_desc" ? undefined : e.target.value })} className="w-auto">
            <option value="date_desc">Newest first</option>
            <option value="date_asc">Oldest first</option>
            <option value="amount_desc">Largest amount</option>
            <option value="amount_asc">Smallest amount</option>
          </Select>
        </div>
      )}
      {hasFilters && (
        <button onClick={() => { setQ(""); setMin(""); setMax(""); router.push(pathname); }} className="inline-flex w-fit items-center gap-1 text-[13px] text-primary hover:underline">
          <X className="h-3.5 w-3.5" /> Clear filters
        </button>
      )}
    </div>
  );
}
