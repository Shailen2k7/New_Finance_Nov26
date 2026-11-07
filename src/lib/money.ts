// Money utilities. All amounts are stored as integers in minor units (e.g. cents).

export type CurrencyInfo = { code: string; name: string; symbol: string; decimals: number };

export const CURRENCIES: CurrencyInfo[] = [
  { code: "USD", name: "US Dollar", symbol: "$", decimals: 2 },
  { code: "GBP", name: "British Pound", symbol: "£", decimals: 2 },
  { code: "EUR", name: "Euro", symbol: "€", decimals: 2 },
  { code: "INR", name: "Indian Rupee", symbol: "₹", decimals: 2 },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", decimals: 2 },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$", decimals: 2 },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ", decimals: 2 },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$", decimals: 2 },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$", decimals: 2 },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF", decimals: 2 },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", decimals: 0 },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", decimals: 2 },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$", decimals: 2 },
  { code: "SAR", name: "Saudi Riyal", symbol: "﷼", decimals: 2 },
  { code: "QAR", name: "Qatari Riyal", symbol: "﷼", decimals: 2 },
  { code: "ZAR", name: "South African Rand", symbol: "R", decimals: 2 },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦", decimals: 2 },
  { code: "PKR", name: "Pakistani Rupee", symbol: "₨", decimals: 2 },
  { code: "BDT", name: "Bangladeshi Taka", symbol: "৳", decimals: 2 },
  { code: "LKR", name: "Sri Lankan Rupee", symbol: "Rs", decimals: 2 },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM", decimals: 2 },
  { code: "PHP", name: "Philippine Peso", symbol: "₱", decimals: 2 },
  { code: "KRW", name: "South Korean Won", symbol: "₩", decimals: 0 },
  { code: "BRL", name: "Brazilian Real", symbol: "R$", decimals: 2 },
  { code: "MXN", name: "Mexican Peso", symbol: "MX$", decimals: 2 },
  { code: "SEK", name: "Swedish Krona", symbol: "kr", decimals: 2 },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr", decimals: 2 },
  { code: "DKK", name: "Danish Krone", symbol: "kr", decimals: 2 },
  { code: "PLN", name: "Polish Zloty", symbol: "zł", decimals: 2 },
  { code: "TRY", name: "Turkish Lira", symbol: "₺", decimals: 2 },
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh", decimals: 2 },
  { code: "EGP", name: "Egyptian Pound", symbol: "E£", decimals: 2 },
];

export const CURRENCY_CODES = CURRENCIES.map((c) => c.code);

export function currencyInfo(code: string): CurrencyInfo {
  return CURRENCIES.find((c) => c.code === code) ?? { code, name: code, symbol: code, decimals: 2 };
}

/** We always store 2 implied decimals regardless of currency to keep arithmetic uniform. */
export const MINOR_FACTOR = 100;

export function toMinor(amount: number): number {
  return Math.round(amount * MINOR_FACTOR);
}

export function fromMinor(minor: number): number {
  return minor / MINOR_FACTOR;
}

export function formatMoney(
  minor: number,
  currency: string,
  opts: { signed?: boolean; compact?: boolean; hideDecimals?: boolean } = {},
): string {
  const info = currencyInfo(currency);
  const value = fromMinor(minor);
  const decimals = opts.hideDecimals ? 0 : info.decimals;
  let formatted: string;
  try {
    formatted = new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      notation: opts.compact ? "compact" : "standard",
      currencyDisplay: "narrowSymbol",
    }).format(Math.abs(value));
  } catch {
    formatted = `${info.symbol}${Math.abs(value).toFixed(decimals)}`;
  }
  if (value < 0) return `-${formatted}`;
  if (opts.signed && value > 0) return `+${formatted}`;
  return formatted;
}

export function formatNumber(n: number, decimals = 0) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(n);
}

/**
 * Deterministically parse an amount string from a bank statement into minor units.
 * Handles: "1,234.56", "-1,234.56", "(1,234.56)", "1.234,56", "£1,234.56", "1,234.56 CR", "1 234,56", "USD 500.00", "DR 20.00"
 * Returns null if the string is not a number.
 */
export function parseAmountToMinor(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? toMinor(input) : null;
  let s = String(input).trim();
  if (!s) return null;
  let negative = false;
  // Credit / debit markers
  if (/\b(CR|C)\b\.?$/i.test(s) || /^(CR|C)\b/i.test(s)) {
    s = s.replace(/\b(CR|C)\b\.?/gi, "");
  } else if (/\b(DR|D|DB)\b\.?$/i.test(s) || /^(DR|D|DB)\b/i.test(s)) {
    negative = true;
    s = s.replace(/\b(DR|D|DB)\b\.?/gi, "");
  }
  s = s.trim();
  // Parentheses negative
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  // Trailing minus
  if (/-\s*$/.test(s)) {
    negative = true;
    s = s.replace(/-\s*$/, "");
  }
  // Leading sign
  if (/^[-−–]/.test(s)) {
    negative = true;
    s = s.replace(/^[-−–]\s*/, "");
  } else if (/^\+/.test(s)) {
    s = s.replace(/^\+\s*/, "");
  }
  // Strip currency codes/symbols and spaces
  s = s.replace(/[A-Za-z]{3}/g, "").replace(/[^\d.,'’\s-]/g, "").replace(/\s+/g, "").replace(/['’]/g, "");
  if (/^-/.test(s)) {
    negative = true;
    s = s.slice(1);
  }
  if (!s || !/\d/.test(s)) return null;

  // Decide decimal separator
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    // Whichever comes last is the decimal separator
    if (lastDot > lastComma) normalized = s.replace(/,/g, "");
    else normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (lastComma >= 0) {
    // Only commas: decimal if exactly 2 digits after the last comma and only one comma
    const parts = s.split(",");
    const tail = parts[parts.length - 1];
    if (parts.length === 2 && tail.length === 2) normalized = s.replace(",", ".");
    else if (parts.length === 2 && tail.length === 1) normalized = s.replace(",", ".");
    else normalized = s.replace(/,/g, "");
  } else {
    // Only dots: if more than one dot, dots are thousand separators
    const parts = s.split(".");
    if (parts.length > 2) normalized = s.replace(/\./g, "");
    else normalized = s;
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  const minor = toMinor(n);
  return negative ? -minor : minor;
}

export function sumMinor(values: Array<number | null | undefined>): number {
  return values.reduce<number>((acc, v) => acc + (v ?? 0), 0);
}

/** Short axis label: ₹14L, ₹1.2Cr for INR and 1.5M, 500K elsewhere. */
export function compactAxis(value: number, currency: string): string {
  const abs = Math.abs(value);
  const short = (n: number) => String(Math.round(n * 10) / 10);
  const steps: [number, string][] = currency === "INR" ? [[1e7, "Cr"], [1e5, "L"], [1e3, "K"]] : [[1e9, "B"], [1e6, "M"], [1e3, "K"]];
  const step = steps.find(([size]) => abs >= size);
  const text = step ? short(abs / step[0]) + step[1] : short(abs);
  return value < 0 ? `-${text}` : text;
}
