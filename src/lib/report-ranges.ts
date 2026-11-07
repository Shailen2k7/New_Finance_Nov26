import { startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subYears, addMonths } from "date-fns";
import { toISO, monthKey } from "./dates";

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

export function presetRange(p: RangePreset, now = new Date()): ReportRange {
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

