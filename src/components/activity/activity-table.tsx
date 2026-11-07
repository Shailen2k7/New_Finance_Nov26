"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { toQuery, type Filters } from "./activity-filters";

type Row = { id: string; actor: string; action: string; entity: string; entityId: string | null; summary: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; createdAt: string };

const VERB_TONE: Record<string, "green" | "blue" | "red" | "gray" | "amber" | "purple"> = { create: "green", update: "blue", delete: "red", login: "gray", logout: "gray", commit: "green", bulk_categorize: "blue" };
const VERB_LABEL: Record<string, string> = { create: "Created", update: "Updated", delete: "Deleted", login: "Signed in", logout: "Signed out", commit: "Imported", bulk_categorize: "Categorized" };
const ENTITY_LABEL: Record<string, string> = { transaction: "Transaction", account: "Account", category: "Category", loan: "Loan", loan_payment: "Loan payment", recurring: "Recurring", settings: "Settings", session: "Session", import: "Import" };
const HIDDEN_KEYS = new Set(["updatedAt", "createdAt", "fingerprint", "fxRate", "baseAmountMinor", "raw", "id"]);

function changedKeys(before: Record<string, unknown> | null | undefined, after: Record<string, unknown> | null | undefined): string[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...keys].filter((k) => JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after?.[k] ?? null));
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}

function fmt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.length ? v.map(String).join(", ") : "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function pretty(key: string) {
  return key.replace(/Minor$/, "").replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).replace(/ Id$/, "");
}

export function ActivityTable({ rows, total, page, pageSize, filters }: { rows: Row[]; total: number; page: number; pageSize: number; filters: Filters }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  if (rows.length === 0) return <div className="card"><EmptyState icon={<History className="h-5 w-5" />} title="No activity yet" description="Changes made by the team will be listed here." /></div>;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="card overflow-hidden p-0">
      <div className="divide-y divide-line md:hidden">
        {rows.map((r) => {
          const verb = r.action.split(".")[1] ?? "update";
          const keys = changedKeys(r.before, r.after).filter((k) => !HIDDEN_KEYS.has(k));
          const isOpen = open.has(r.id);
          return (
            <div key={r.id} className="px-4 py-3.5" onClick={() => keys.length > 0 && toggle(r.id)}>
              <div className="flex items-center justify-between gap-2">
                <Badge tone={VERB_TONE[verb] ?? "gray"} dot>{VERB_LABEL[verb] ?? verb}</Badge>
                <span className="tnum text-[12px] text-muted">{formatDate(r.createdAt, "d MMM yyyy, HH:mm")}</span>
              </div>
              <p className="mt-2 text-[14px] text-ink">{r.summary}</p>
              <p className="mt-1 flex items-center gap-1 text-[12px] text-muted">
                {r.actor} · {ENTITY_LABEL[r.entity] ?? r.entity}
                {keys.length > 0 && (isOpen ? <ChevronDown className="ml-auto h-4 w-4 text-faint" /> : <ChevronRight className="ml-auto h-4 w-4 text-faint" />)}
              </p>
              {isOpen && (
                <div className="mt-2 grid grid-cols-1 gap-y-1 rounded-lg bg-surface-2 p-3 text-[13px]">
                  {keys.map((k) => <FragmentRow key={k} label={pretty(k)} before={fmt(r.before?.[k])} after={fmt(r.after?.[k])} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="table">
          <thead>
            <tr><th className="w-8"></th><th>When</th><th>Who</th><th>Action</th><th>Area</th><th>Change</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const verb = r.action.split(".")[1] ?? "update";
              const keys = changedKeys(r.before, r.after).filter((k) => !HIDDEN_KEYS.has(k));
              const expandable = keys.length > 0;
              const isOpen = open.has(r.id);
              return (
                <RowGroup key={r.id}>
                  <tr className={cn(expandable && "cursor-pointer")} onClick={() => expandable && toggle(r.id)}>
                    <td className="text-faint">{expandable ? (isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : null}</td>
                    <td className="whitespace-nowrap tnum text-ink-2" title={formatDate(r.createdAt, "d MMM yyyy, HH:mm:ss")}>{formatDate(r.createdAt, "d MMM yyyy, HH:mm")}</td>
                    <td>
                      <span className="flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-[11px] font-semibold text-primary">{initials(r.actor)}</span>
                        <span className="whitespace-nowrap font-medium text-ink">{r.actor}</span>
                      </span>
                    </td>
                    <td><Badge tone={VERB_TONE[verb] ?? "gray"} dot>{VERB_LABEL[verb] ?? verb}</Badge></td>
                    <td className="whitespace-nowrap text-ink-2">{ENTITY_LABEL[r.entity] ?? r.entity}</td>
                    <td className="max-w-[560px] text-ink">{r.summary}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td></td>
                      <td colSpan={5} className="bg-surface-2">
                        <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 py-1 text-[13px] sm:grid-cols-[180px_1fr_1fr]">
                          <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Field</span>
                          <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Before</span>
                          <span className="text-[11px] font-medium uppercase tracking-wide text-muted">After</span>
                          {keys.map((k) => (
                            <FragmentRow key={k} label={pretty(k)} before={fmt(r.before?.[k])} after={fmt(r.after?.[k])} />
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </RowGroup>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-[13px] text-muted sm:px-5">
        <span>Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</span>
        <span className="flex items-center gap-2">
          {page > 1 && <Link href={`/activity${toQuery({ ...filters, page: page - 1 })}`} className="rounded-lg border border-line px-3 py-1.5 hover:bg-surface-2">Previous</Link>}
          <span>Page {page} of {pages}</span>
          {page < pages && <Link href={`/activity${toQuery({ ...filters, page: page + 1 })}`} className="rounded-lg border border-line px-3 py-1.5 hover:bg-surface-2">Next</Link>}
        </span>
      </div>
    </div>
  );
}

function RowGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function FragmentRow({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <>
      <span className="text-muted">{label}</span>
      <span className="break-words text-danger/80 line-through decoration-danger/40">{before}</span>
      <span className="break-words font-medium text-success">{after}</span>
    </>
  );
}
