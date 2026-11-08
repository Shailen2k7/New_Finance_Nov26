import { parse, isValid, format } from "date-fns";

export const ISO = "yyyy-MM-dd";

/** The business runs on Indian time, wherever the server happens to be. */
export const BUSINESS_TZ = "Asia/Kolkata";

/** Current wall-clock time in India as a local Date (same fields a clock in India would show). */
export function businessNow(): Date {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TZ, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" }).formatToParts(now);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    return new Date(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  } catch {
    return now;
  }
}

export function todayISO(): string {
  return format(businessNow(), ISO);
}

export function toISO(d: Date): string {
  return format(d, ISO);
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Parse a date string from a statement. `hint` is "DMY" | "MDY" | "YMD" for purely numeric dates.
 * Returns ISO yyyy-MM-dd or null. Deterministic — never guesses when ambiguous without a hint.
 */
export function parseStatementDate(
  input: string | number | Date | null | undefined,
  hint: "DMY" | "MDY" | "YMD" = "DMY",
  fallbackYear?: number,
): string | null {
  if (input === null || input === undefined || input === "") return null;
  if (input instanceof Date) return isValid(input) ? toISO(input) : null;
  if (typeof input === "number") {
    // Excel serial date
    if (input > 20000 && input < 80000) {
      const ms = Math.round((input - 25569) * 86400 * 1000);
      const d = new Date(ms);
      return isValid(d) ? format(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), ISO) : null;
    }
    return null;
  }
  const s = String(input).trim().replace(/\s+/g, " ");
  if (!s) return null;

  // ISO-like
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return build(+m[1], +m[2], +m[3]);

  // Numeric d/m/y or m/d/y with 2 or 4 digit year
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    const a = +m[1], b = +m[2];
    let y = +m[3];
    if (m[3].length === 2) y += y < 70 ? 2000 : 1900;
    // Disambiguate when possible
    if (a > 12 && b <= 12) return build(y, b, a);
    if (b > 12 && a <= 12) return build(y, a, b);
    return hint === "MDY" ? build(y, a, b) : build(y, b, a);
  }

  // "12 Mar 2024", "12-Mar-24", "12 March 2024"
  m = s.match(/^(\d{1,2})[\s\-/]([A-Za-z]{3,9})\.?[\s\-/,]*(\d{2,4})?$/);
  if (m) {
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()] ?? MONTHS[m[2].toLowerCase()];
    if (mon) {
      let y = m[3] ? +m[3] : fallbackYear ?? new Date().getFullYear();
      if (m[3] && m[3].length === 2) y += y < 70 ? 2000 : 1900;
      return build(y, mon, +m[1]);
    }
  }
  // "Mar 12, 2024", "March 12 2024", "Mar 12"
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{2,4})?$/);
  if (m) {
    const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (mon) {
      let y = m[3] ? +m[3] : fallbackYear ?? new Date().getFullYear();
      if (m[3] && m[3].length === 2) y += y < 70 ? 2000 : 1900;
      return build(y, mon, +m[2]);
    }
  }
  // Try a few date-fns formats as a last resort
  for (const f of ["dd MMM yyyy", "d MMM yyyy", "MMM d, yyyy", "yyyy-MM-dd'T'HH:mm:ss", "yyyyMMdd", "dd/MM/yyyy HH:mm", "MM/dd/yyyy HH:mm"]) {
    const d = parse(s, f, new Date());
    if (isValid(d)) return toISO(d);
  }
  return null;
}

function build(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  const date = new Date(y, m - 1, d);
  if (date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return format(date, ISO);
}

export function formatDate(iso: string | Date | null | undefined, f = "d MMM yyyy"): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso + (iso.length === 10 ? "T00:00:00" : "")) : iso;
  return isValid(d) ? format(d, f) : "";
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return format(new Date(y, m - 1, 1), "MMM yy");
}
