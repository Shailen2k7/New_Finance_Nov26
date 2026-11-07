"use client";
import { useRouter, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { RANGE_PRESETS, type RangePreset, type ReportRange } from "@/lib/report-ranges";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ReportFilters({ accounts, range, preset, accountId }: { accounts: { id: string; name: string; isArchived: boolean }[]; range: ReportRange; preset?: RangePreset; accountId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [pending, start] = useTransition();

  const push = (params: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    start(() => router.push(`${pathname}?${qs.toString()}`));
  };

  const custom = from !== range.from || to !== range.to;

  return (
    <div className="card flex flex-wrap items-center justify-between gap-x-4 gap-y-3 p-3">
      <div className="flex flex-wrap gap-1">
        {RANGE_PRESETS.map((p) => (
          <button key={p.value} onClick={() => push({ preset: p.value, account: accountId })} className={cn("whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition", preset === p.value ? "bg-primary text-white" : "text-ink-2 hover:bg-surface-2")}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 max-sm:w-full">
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[140px] max-sm:w-[calc(50%-18px)] max-sm:min-w-0" />
        <span className="text-[13px] text-muted">to</span>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[140px] max-sm:w-[calc(50%-18px)] max-sm:min-w-0" />
        {custom && <Button size="sm" onClick={() => push({ from, to, account: accountId })} loading={pending} disabled={!from || !to || from > to}>Apply</Button>}
        {(accounts.length > 1 || accountId) && (
          <Select value={accountId ?? ""} onChange={(e) => push({ ...(preset ? { preset } : { from: range.from, to: range.to }), account: e.target.value || undefined })} className="w-[180px] max-sm:w-full">
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}{a.isArchived ? " (archived)" : ""}</option>
            ))}
          </Select>
        )}
      </div>
    </div>
  );
}
