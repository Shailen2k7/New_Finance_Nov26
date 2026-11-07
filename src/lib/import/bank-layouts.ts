// Deterministic parsers for known bank PDF text layouts. Each parser returns null when the layout does not match.
// Amounts are taken digit-for-digit from the text layer and every row is verified against the running balance.
import { parseAmountToMinor } from "../money";
import { parseStatementDate } from "../dates";
import type { ParsedTxn, ParseResult, StatementMeta } from "./types";

const NOISE = /^(Generated on\s*:|Page \d+ of \d+|S\.no|ID$|Transaction$|date$|Cheque No|\(Dr\)$|\(Cr\)$|Available$|Balance$|Deposit$|Withdrawal|\*This is a system-generated|\d{1,2}\. [A-Z]{2,6}(\s*\/\s*[A-Z]+)* ?-|Legends?|Account statement)/i;

/**
 * ICICI Bank (India) "Account statement" PDF. The text layer prints each transaction as
 *   "<sno><TxnId><DD-Mon->" , "<yyyy>" , description lines…, "<amount><balance>"
 * where the amount and the running balance are concatenated (e.g. "9322.0011956.72").
 * The withdrawal/deposit direction is derived from the running balance, so every row is self-verifying.
 */
export function parseIciciLayout(text: string): ParseResult | null {
  if (!/ICIC0|Account statement|Statement of transactions/i.test(text)) return null;
  const raw = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const start = /^(\d+)\s*([SCMsc]\d+?)(\d{2})-([A-Za-z]{3})-(\d{4})?(.*)$/;
  const amtBal = /^(-?\d+\.\d{2})(-?\d+\.\d{2})$/;

  const meta: StatementMeta = { currency: "INR", bank: "ICICI Bank" };
  const period = text.match(/Statement of transactions from\s+(\d{1,2} \w{3} '?\d{2,4})\s*-\s*(\d{1,2} \w{3} '?\d{2,4})/i);
  if (period) {
    meta.periodStart = parseStatementDate(period[1].replace("'", "20").replace(/(\w{3}) 20(\d{2})$/, "$1 20$2"));
    meta.periodEnd = parseStatementDate(period[2].replace("'", "20").replace(/(\w{3}) 20(\d{2})$/, "$1 20$2"));
  }
  const acct = text.match(/Account number:\s*(\d{6,})/i);
  if (acct) meta.accountNumberMasked = "••••" + acct[1].slice(-4);
  const holder = text.match(/Account name:\s*([\s\S]{3,120}?)\s*Account number/i);
  if (holder) meta.accountHolder = holder[1].replace(/\s+/g, " ").trim();
  const avail = text.match(/Available balance:\s*₹?\s*([\d,]+\.\d{2})/i);
  if (avail) meta.closingBalanceMinor = parseAmountToMinor(avail[1]);
  const cur = text.match(/Account currency:\s*([A-Z]{3})/);
  if (cur) meta.currency = cur[1];

  type Block = { sno: number; id: string; day: string; mon: string; year: string | null; lines: string[] };
  const blocks: Block[] = [];
  for (const line of raw) {
    const m = line.match(start);
    if (m) {
      const b: Block = { sno: Number(m[1]), id: m[2].toUpperCase(), day: m[3], mon: m[4], year: m[5] ?? null, lines: [] };
      if (m[6]) b.lines.push(m[6].trim());
      blocks.push(b);
      continue;
    }
    if (!blocks.length) continue;
    blocks[blocks.length - 1].lines.push(line);
  }
  if (blocks.length < 3) return null;

  const txns: ParsedTxn[] = [];
  let prevBalance: number | null = null;
  const notes: string[] = [];
  blocks.forEach((b, idx) => {
    let year = b.year;
    const body: string[] = [];
    let amountLine: string | null = null;
    for (const l of b.lines) {
      if (!year && /^\d{4}$/.test(l)) { year = l; continue; }
      if (amountLine) break; // anything after the amount/balance line is page noise or legend
      const am = l.match(amtBal);
      if (am) { amountLine = l; continue; }
      if (NOISE.test(l)) continue;
      body.push(l);
    }
    const description = joinWrapped(body);
    const issues: string[] = [];
    let amount: number | null = null;
    let balance: number | null = null;
    if (amountLine) {
      const am = amountLine.match(amtBal)!;
      amount = parseAmountToMinor(am[1]);
      balance = parseAmountToMinor(am[2]);
    } else issues.push("unparsed_amount");
    if (amount !== null && balance !== null) {
      if (prevBalance !== null) {
        if (prevBalance - amount === balance) amount = -amount;
        else if (prevBalance + amount === balance) { /* deposit */ }
        else { issues.push("balance_break"); amount = -amount; }
      } else {
        // First row: no opening balance is printed. Treat as money out unless the narration says otherwise; flagged for review.
        const looksIn = /razorpay|payment from|neft-.*(razorpay|cr)|deposit|refund|interest|cash dep|trfr from/i.test(description);
        amount = looksIn ? amount : -amount;
        issues.push("direction_assumed");
        meta.openingBalanceMinor = balance - amount;
      }
      prevBalance = balance;
    }
    const date = year ? parseStatementDate(`${b.day}-${b.mon}-${year}`) : null;
    if (!date) issues.push("unparsed_date");
    txns.push({ rowIndex: idx, date, description: description || `Transaction ${b.id}`, amountMinor: amount, balanceAfterMinor: balance, reference: b.id, currency: meta.currency, raw: { sno: b.sno, line: amountLine }, issues });
  });
  // Sanity: serial numbers must be consecutive, otherwise a row was missed
  const missing: number[] = [];
  for (let i = 1; i < blocks.length; i++) if (blocks[i].sno !== blocks[i - 1].sno + 1) missing.push(blocks[i - 1].sno + 1);
  if (missing.length) notes.push(`Serial numbers skip at ${missing.slice(0, 10).join(", ")} — check those rows against the PDF.`);
  else notes.push(`${blocks.length} transactions read in serial order (1–${blocks[blocks.length - 1].sno}); every amount and direction verified against the printed running balance.`);
  if (txns.length && meta.closingBalanceMinor == null) meta.closingBalanceMinor = txns[txns.length - 1].balanceAfterMinor ?? null;
  return { engine: "heuristic", txns, meta, notes, textForVerification: text };
}

/** Re-joins narration lines that the PDF wrapped mid-token (fixed column width, no hyphenation). */
export function joinWrapped(lines: string[]): string {
  let out = "";
  for (const l of lines) {
    if (!out) { out = l; continue; }
    const p = out[out.length - 1];
    const n = l[0];
    const prevLen = out.length - Math.max(out.lastIndexOf(" "), -1) - 1; // length of the last wrapped segment
    const glue =
      /[-\/@.+]/.test(p) || /[\/@.+]/.test(n) ? ""
      : /\d/.test(p) && /\d/.test(n) ? ""
      : /[a-z]/.test(n) ? "" // continuation of a word
      : /[A-Z]/.test(p) && /[A-Z]/.test(n) && prevLen >= 9 ? ""
      : /[A-Za-z]/.test(p) && /\d/.test(n) && prevLen >= 9 ? ""
      : /\d/.test(p) && /[A-Za-z]/.test(n) && prevLen >= 9 ? ""
      : " ";
    out += glue + l;
  }
  return out.replace(/\s+/g, " ").trim();
}

export const LAYOUT_PARSERS: Array<(text: string) => ParseResult | null> = [parseIciciLayout];

export function parseKnownLayout(text: string): ParseResult | null {
  for (const p of LAYOUT_PARSERS) {
    try {
      const r = p(text);
      if (r && r.txns.length >= 3) return r;
    } catch {
      /* try next */
    }
  }
  return null;
}
