"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronDown } from "lucide-react";
import { QUICK_RANGES, type QuickRangeId } from "@/lib/report-ranges";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAIN: { id: QuickRangeId; label: string }[] = [
  { id: "this_month", label: "This month" },
  { id: "this_quarter", label: "Quarter" },
  { id: "this_year", label: "This year" },
  { id: "last_12", label: "12 months" },
];
const MORE: QuickRangeId[] = ["today", "yesterday", "last_7", "last_30", "last_90", "last_month", "this_fy", "last_fy"];
const PANEL_W = 340;

const segment = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition sm:px-3";

export function RangePicker({ activeKey, label, from, to }: { activeKey: string; label: string; from: string; to: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [days, setDays] = useState(activeKey.startsWith("days:") ? activeKey.slice(5) : "");
  const [cFrom, setCFrom] = useState(from);
  const [cTo, setCTo] = useState(to);

  useEffect(() => {
    setCFrom(from);
    setCTo(to);
    setDays(activeKey.startsWith("days:") ? activeKey.slice(5) : "");
  }, [from, to, activeKey]);

  const go = (qs: string) => {
    setOpen(false);
    start(() => router.push(`/?${qs}`));
  };

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(PANEL_W, window.innerWidth - 32);
    const left = Math.min(Math.max(16, r.right - width), window.innerWidth - 16 - width);
    setPos({ top: r.bottom + 8, left, width });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, place]);

  const isMain = MAIN.some((m) => m.id === activeKey);
  const n = Number(days);
  const daysOk = Number.isInteger(n) && n >= 1 && n <= 3660;
  const customOk = Boolean(cFrom && cTo && cFrom <= cTo);

  return (
    <div className={cn("flex max-w-full flex-wrap items-center gap-2 transition-opacity", pending && "opacity-60")}>
      <div className="no-scrollbar inline-flex max-w-full overflow-x-auto rounded-xl border border-line bg-surface-2 p-1">
        {MAIN.map((o) => (
          <button key={o.id} type="button" onClick={() => go(`range=${o.id}`)} className={cn(segment, activeKey === o.id ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}>
            {o.label}
          </button>
        ))}
      </div>
      <button ref={btn} type="button" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)} className={cn("inline-flex h-[38px] items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 text-[13px] font-medium transition", !isMain ? "border-primary/40 bg-primary-50 text-primary" : open ? "border-line-strong bg-surface text-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink")}>
        <CalendarDays className="h-4 w-4" />
        {isMain ? "Custom" : label}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && pos &&
        createPortal(
          <div ref={panel} role="dialog" aria-label="Choose dates" style={{ top: pos.top, left: pos.left, width: pos.width }} className="fade-up fixed z-50 max-h-[calc(100dvh-96px)] overflow-y-auto rounded-2xl border border-line bg-surface p-4 shadow-pop">
            <p className="mb-2 text-[12px] font-medium uppercase tracking-wide text-faint">Quick ranges</p>
            <div className="grid grid-cols-2 gap-1.5">
              {MORE.map((id) => {
                const q = QUICK_RANGES.find((x) => x.id === id)!;
                return (
                  <button key={id} type="button" onClick={() => go(`range=${id}`)} className={cn("truncate rounded-lg border px-3 py-2 text-left text-[13px] font-medium transition", activeKey === id ? "border-primary bg-primary-50 text-primary" : "border-line text-ink-2 hover:border-line-strong hover:bg-surface-2")}>
                    {q.label}
                  </button>
                );
              })}
            </div>

            <form className="mt-4 border-t border-line pt-4" onSubmit={(e) => { e.preventDefault(); if (daysOk) go(`days=${n}`); }}>
              <p className="mb-2 text-[12px] font-medium uppercase tracking-wide text-faint">Last few days</p>
              <div className="flex items-center gap-2">
                <span className="text-[14px] text-ink-2">Last</span>
                <Input type="number" inputMode="numeric" min={1} max={3660} value={days} onChange={(e) => setDays(e.target.value)} placeholder="9" className="w-20 text-center" aria-label="Number of days" />
                <span className="text-[14px] text-ink-2">days</span>
                <Button type="submit" size="sm" variant="secondary" className="ml-auto" disabled={!daysOk}>Show</Button>
              </div>
            </form>

            <form className="mt-4 border-t border-line pt-4" onSubmit={(e) => { e.preventDefault(); if (customOk) go(`from=${cFrom}&to=${cTo}`); }}>
              <p className="mb-2 text-[12px] font-medium uppercase tracking-wide text-faint">Custom dates</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="min-w-0 text-[12px] text-muted">From<Input type="date" value={cFrom} max={cTo || undefined} onChange={(e) => setCFrom(e.target.value)} className="mt-1 w-full min-w-0" /></label>
                <label className="min-w-0 text-[12px] text-muted">To<Input type="date" value={cTo} min={cFrom || undefined} onChange={(e) => setCTo(e.target.value)} className="mt-1 w-full min-w-0" /></label>
              </div>
              {cFrom && cTo && cFrom > cTo && <p className="mt-2 text-[12px] text-danger">The start date must be on or before the end date.</p>}
              <Button type="submit" size="sm" className="mt-3 w-full" disabled={!customOk}>Apply dates</Button>
            </form>
          </div>,
          document.body,
        )}
    </div>
  );
}
