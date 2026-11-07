"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input, Select } from "@/components/ui/input";

export type Filters = { actor?: string; entity?: string; verb?: string; from?: string; to?: string; q?: string; page?: number };

export function toQuery(f: Filters): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== "" && !(k === "page" && Number(v) <= 1)) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

const ENTITY_LABEL: Record<string, string> = { transaction: "Transactions", account: "Accounts", category: "Categories", loan: "Loans", loan_payment: "Loan payments", recurring: "Recurring", settings: "Settings", session: "Sign-ins", import: "Imports" };

export function ActivityFilters({ filters, actors, entities }: { filters: Filters; actors: string[]; entities: string[] }) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q ?? "");
  const apply = (patch: Filters) => router.push(`/activity${toQuery({ ...filters, ...patch, page: undefined })}`);
  useEffect(() => {
    const t = setTimeout(() => { if ((filters.q ?? "") !== q) apply({ q }); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const active = Boolean(filters.actor || filters.entity || filters.verb || filters.from || filters.to || filters.q);
  return (
    <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
      <div className="relative min-w-[180px] flex-1 max-sm:basis-full">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search changes…" className="pl-9" />
      </div>
      <Select value={filters.actor ?? ""} onChange={(e) => apply({ actor: e.target.value || undefined })} className="w-auto min-w-[130px] max-sm:w-[calc(50%-4px)] max-sm:min-w-0">
        <option value="">Everyone</option>
        {actors.map((a) => <option key={a} value={a}>{a}</option>)}
      </Select>
      <Select value={filters.entity ?? ""} onChange={(e) => apply({ entity: e.target.value || undefined })} className="w-auto min-w-[130px] max-sm:w-[calc(50%-4px)] max-sm:min-w-0">
        <option value="">All areas</option>
        {entities.map((e) => <option key={e} value={e}>{ENTITY_LABEL[e] ?? e}</option>)}
      </Select>
      <Select value={filters.verb ?? ""} onChange={(e) => apply({ verb: e.target.value || undefined })} className="w-auto min-w-[130px] max-sm:w-full max-sm:min-w-0">
        <option value="">All actions</option>
        <option value="create">Created</option>
        <option value="update">Updated</option>
        <option value="delete">Deleted</option>
        <option value="commit">Imported</option>
        <option value="bulk_categorize">Categorized</option>
        <option value="login">Signed in</option>
        <option value="logout">Signed out</option>
      </Select>
      <div className="flex min-w-0 items-center gap-2 max-sm:w-full">
        <Input type="date" value={filters.from ?? ""} onChange={(e) => apply({ from: e.target.value || undefined })} className="w-[140px] max-sm:min-w-0 max-sm:flex-1" />
        <span className="text-[13px] text-muted">to</span>
        <Input type="date" value={filters.to ?? ""} onChange={(e) => apply({ to: e.target.value || undefined })} className="w-[140px] max-sm:min-w-0 max-sm:flex-1" />
      </div>
      {active && (
        <button onClick={() => { setQ(""); router.push("/activity"); }} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-[13px] text-muted hover:bg-surface-2 hover:text-ink"><X className="h-3.5 w-3.5" /> Clear</button>
      )}
    </div>
  );
}
