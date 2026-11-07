import { startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, subYears } from "date-fns";
import type { TxnFilters } from "@/lib/queries";
import { toISO } from "@/lib/dates";

export type SP = Record<string, string | string[] | undefined>;
export type Preset = "ALL" | "INCOME" | "EXPENSE";

export const RANGE_OPTIONS = [
  { value: "all", label: "All time" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3", label: "Last 3 months" },
  { value: "this_year", label: "This year" },
  { value: "last_year", label: "Last year" },
  { value: "custom", label: "Custom" },
] as const;
export type RangeKey = (typeof RANGE_OPTIONS)[number]["value"];

export function rangeToDates(range: string | undefined): { from?: string; to?: string } {
  const now = new Date();
  switch (range) {
    case "this_month":
      return { from: toISO(startOfMonth(now)), to: toISO(endOfMonth(now)) };
    case "last_month": {
      const d = subMonths(now, 1);
      return { from: toISO(startOfMonth(d)), to: toISO(endOfMonth(d)) };
    }
    case "last_3":
      return { from: toISO(startOfMonth(subMonths(now, 2))), to: toISO(endOfMonth(now)) };
    case "this_year":
      return { from: toISO(startOfYear(now)), to: toISO(endOfYear(now)) };
    case "last_year": {
      const d = subYears(now, 1);
      return { from: toISO(startOfYear(d)), to: toISO(endOfYear(d)) };
    }
    default:
      return {};
  }
}

function one(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v || undefined;
}

export function parseFilters(sp: SP, preset: Preset): TxnFilters {
  const range = one(sp.range);
  let from = one(sp.from);
  let to = one(sp.to);
  if (!from && !to && range && range !== "custom") {
    const r = rangeToDates(range);
    from = r.from;
    to = r.to;
  }
  const typeParam = one(sp.type);
  const type = preset !== "ALL" ? preset : typeParam === "INCOME" || typeParam === "EXPENSE" || typeParam === "TRANSFER" ? typeParam : undefined;
  const min = one(sp.min);
  const max = one(sp.max);
  const page = Number(one(sp.page) ?? 1);
  const sortRaw = one(sp.sort);
  const sort = sortRaw === "date_asc" || sortRaw === "amount_desc" || sortRaw === "amount_asc" ? sortRaw : "date_desc";
  return {
    q: one(sp.q),
    type,
    accountId: one(sp.accountId),
    categoryId: one(sp.categoryId),
    from,
    to,
    min: min !== undefined && min !== "" && !Number.isNaN(Number(min)) ? Number(min) : undefined,
    max: max !== undefined && max !== "" && !Number.isNaN(Number(max)) ? Number(max) : undefined,
    uncategorized: one(sp.uncategorized) === "1",
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize: 50,
    sort,
  };
}

export function toQueryString(params: Record<string, string | number | boolean | undefined | null>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    usp.set(k, String(v === true ? 1 : v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}
