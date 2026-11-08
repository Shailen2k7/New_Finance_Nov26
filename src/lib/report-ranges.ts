import { startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subYears, addMonths, subDays, differenceInCalendarDays, format } from "date-fns";
import { toISO, monthKey, businessNow } from "./dates";

export type ReportRange = { from: string; to: string };

export type RangePreset = "this_month" | "last_month" | "this_quarter" | "this_year" | "last_year" | "last_12";

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "this_year", label: "This year" },
  { value: "last_year", label: "Last year" },
  { value: "last_12", label: "Last 12 months" },
];

export function presetRange(p: RangePreset, now = businessNow()): ReportRange {
  switch (p) {
    case "this_month":
      return { from: toISO(startOfMonth(now)), to: toISO(endOfMonth(now)) };
    case "last_month": {
      const m = subMonths(now, 1);
      return { from: toISO(startOfMonth(m)), to: toISO(endOfMonth(m)) };
    }
    case "this_quarter":
      return { from: toISO(startOfQuarter(now)), to: toISO(endOfQuarter(now)) };
    case "this_year":
      return { from: toISO(startOfYear(now)), to: toISO(endOfYear(now)) };
    case "last_year": {
      const y = subYears(now, 1);
      return { from: toISO(startOfYear(y)), to: toISO(endOfYear(y)) };
    }
    case "last_12":
    default:
      return { from: toISO(startOfMonth(subMonths(now, 11))), to: toISO(endOfMonth(now)) };
  }
}

export function resolveRange(params: { from?: string; to?: string; preset?: string }): ReportRange & { preset?: RangePreset } {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (params.from && params.to && iso.test(params.from) && iso.test(params.to)) return { from: params.from, to: params.to };
  const preset = (RANGE_PRESETS.some((p) => p.value === params.preset) ? params.preset : "last_12") as RangePreset;
  return { ...presetRange(preset), preset };
}

/** All month keys (yyyy-MM) between from and to inclusive. */
export function monthsInRange(range: ReportRange): string[] {
  const out: string[] = [];
  let d = startOfMonth(new Date(range.from + "T00:00:00"));
  const end = new Date(range.to + "T00:00:00");
  while (d <= end) {
    out.push(monthKey(toISO(d)));
    d = addMonths(d, 1);
  }
  return out;
}


/* ---------- Dashboard ranges: quick picks, "last N days" and custom dates ---------- */

export type QuickRangeId = RangePreset | "today" | "yesterday" | "last_7" | "last_30" | "last_90" | "this_fy" | "last_fy";

export const QUICK_RANGES: { id: QuickRangeId; label: string }[] = [
  { id: "this_month", label: "This month" },
  { id: "this_quarter", label: "This quarter" },
  { id: "this_year", label: "This year" },
  { id: "last_12", label: "Last 12 months" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last_7", label: "Last 7 days" },
  { id: "last_30", label: "Last 30 days" },
  { id: "last_90", label: "Last 90 days" },
  { id: "last_month", label: "Last month" },
  { id: "this_fy", label: "This financial year" },
  { id: "last_fy", label: "Last financial year" },
  { id: "last_year", label: "Last year" },
];

/** Indian financial year: 1 April to 31 March. */
function financialYear(now: Date, back = 0): ReportRange {
  const startYear = (now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1) - back;
  return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` };
}

function lastDays(n: number, now: Date): ReportRange {
  return { from: toISO(subDays(now, n - 1)), to: toISO(now) };
}

export function quickRange(id: QuickRangeId, now = businessNow()): ReportRange {
  switch (id) {
    case "today": return { from: toISO(now), to: toISO(now) };
    case "yesterday": { const y = toISO(subDays(now, 1)); return { from: y, to: y }; }
    case "last_7": return lastDays(7, now);
    case "last_30": return lastDays(30, now);
    case "last_90": return lastDays(90, now);
    case "this_fy": return financialYear(now);
    case "last_fy": return financialYear(now, 1);
    default: return presetRange(id, now);
  }
}

export type ResolvedRange = ReportRange & { key: string; label: string; days: number };

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const day = (iso: string) => new Date(iso + "T00:00:00");

/** Human label for a pair of dates, e.g. "8 Nov 2026" or "1 Oct – 15 Oct 2026". */
export function datesLabel(r: ReportRange): string {
  const a = day(r.from), b = day(r.to);
  if (r.from === r.to) return format(a, "d MMM yyyy");
  return a.getFullYear() === b.getFullYear() ? `${format(a, "d MMM")} – ${format(b, "d MMM yyyy")}` : `${format(a, "d MMM yyyy")} – ${format(b, "d MMM yyyy")}`;
}

/** Reads ?range=, ?days= or ?from=&to= from the dashboard URL. Anything invalid falls back to the last 12 months. */
export function resolveDashRange(p: { range?: string; days?: string; from?: string; to?: string }): ResolvedRange {
  const finish = (r: ReportRange, key: string, label: string): ResolvedRange => ({ ...r, key, label, days: differenceInCalendarDays(day(r.to), day(r.from)) + 1 });
  if (p.from && p.to && ISO_RE.test(p.from) && ISO_RE.test(p.to) && !isNaN(day(p.from).getTime()) && !isNaN(day(p.to).getTime())) {
    const r = p.from <= p.to ? { from: p.from, to: p.to } : { from: p.to, to: p.from };
    return finish(r, "custom", datesLabel(r));
  }
  const n = Number(p.days);
  if (Number.isInteger(n) && n >= 1 && n <= 3660) return finish(lastDays(n, businessNow()), `days:${n}`, n === 1 ? "Today" : `Last ${n} days`);
  const q = QUICK_RANGES.find((x) => x.id === p.range) ?? QUICK_RANGES.find((x) => x.id === "last_12")!;
  return finish(quickRange(q.id), q.id, q.label);
}
