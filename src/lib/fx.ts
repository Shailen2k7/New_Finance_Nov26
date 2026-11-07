import { eq, and, desc } from "drizzle-orm";
import { getDb, schema } from "./db";

/** Static fallback rates vs USD (used only if the live API is unreachable and nothing is cached). */
const FALLBACK_USD: Record<string, number> = {
  USD: 1, GBP: 0.78, EUR: 0.92, INR: 84, AUD: 1.52, CAD: 1.37, AED: 3.67, SGD: 1.34, NZD: 1.66, CHF: 0.88, JPY: 150,
  CNY: 7.2, HKD: 7.8, SAR: 3.75, QAR: 3.64, ZAR: 18, NGN: 1500, PKR: 278, BDT: 110, LKR: 300, MYR: 4.5, PHP: 57,
  KRW: 1350, BRL: 5.3, MXN: 18, SEK: 10.5, NOK: 10.8, DKK: 6.9, PLN: 4, TRY: 33, KES: 130, EGP: 48,
};

const memory = new Map<string, number>();

async function fetchLiveRate(base: string, quote: string, date: string): Promise<number | null> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 6000);
    // Frankfurter (ECB data) — free, no key. Uses latest available working day for the given date.
    const res = await fetch(`https://api.frankfurter.app/${date}?from=${base}&to=${quote}`, { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const json = (await res.json()) as { rates?: Record<string, number> };
    const r = json.rates?.[quote];
    return typeof r === "number" ? r : null;
  } catch {
    return null;
  }
}

/** Rate such that amount(base) * rate = amount(quote). base = transaction currency, quote = business base currency. */
export async function getFxRate(from: string, to: string, date: string): Promise<{ rate: number; source: string }> {
  if (from === to) return { rate: 1, source: "same" };
  const key = `${from}:${to}:${date}`;
  const cached = memory.get(key);
  if (cached) return { rate: cached, source: "cache" };

  const db = await getDb();
  const row = await db
    .select()
    .from(schema.fxRates)
    .where(and(eq(schema.fxRates.base, from), eq(schema.fxRates.quote, to), eq(schema.fxRates.date, date)))
    .limit(1);
  if (row[0]) {
    const r = Number(row[0].rate);
    memory.set(key, r);
    return { rate: r, source: row[0].source };
  }

  let rate = await fetchLiveRate(from, to, date);
  let source = "frankfurter";
  if (rate === null) {
    // Nearest cached rate for pair, any date
    const nearest = await db
      .select()
      .from(schema.fxRates)
      .where(and(eq(schema.fxRates.base, from), eq(schema.fxRates.quote, to)))
      .orderBy(desc(schema.fxRates.date))
      .limit(1);
    if (nearest[0]) return { rate: Number(nearest[0].rate), source: "nearest" };
    const fu = FALLBACK_USD[from], tu = FALLBACK_USD[to];
    if (fu && tu) {
      rate = tu / fu;
      source = "fallback";
    } else rate = 1;
  }
  memory.set(key, rate);
  try {
    await db.insert(schema.fxRates).values({ base: from, quote: to, rate: rate.toFixed(8), date, source }).onConflictDoNothing();
  } catch {
    /* ignore */
  }
  return { rate, source };
}

export async function convertMinor(amountMinor: number, from: string, to: string, date: string) {
  const { rate } = await getFxRate(from, to, date);
  return { baseAmountMinor: Math.round(amountMinor * rate), rate };
}
