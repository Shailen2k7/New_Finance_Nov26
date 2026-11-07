import { parseAmountToMinor } from "../money";
import { parseStatementDate } from "../dates";
import type { Cell, Grid } from "../parsers/tabular";
import type { ColumnMapping, ParsedTxn } from "./types";

const H = {
  date: /^(txn|trans(action)?|posting|posted|value|booking|book)?\s*_?\s*date$|^date\b|\bdate\b/i,
  description: /description|narrative|particulars|details|memo|payee|name|merchant|transaction\b|remarks|narration/i,
  amount: /^amount$|\bamount\b|^value$|^sum$/i,
  debit: /debit|withdrawal|withdrawals|money\s*out|paid\s*out|outflow|dr\b|spent|charges?/i,
  credit: /credit|deposit|deposits|money\s*in|paid\s*in|inflow|cr\b|received/i,
  balance: /balance|running|closing/i,
  reference: /reference|ref\b|cheque|check\s*no|transaction\s*id|id$/i,
  type: /^type$|^(cr\/dr|dr\/cr|d\/c|c\/d|transaction type|txn type)$/i,
  currency: /currency|ccy/i,
};

function str(c: Cell): string {
  return c === null || c === undefined ? "" : String(c).trim();
}

export function findHeaderRow(grid: Grid): number {
  for (let i = 0; i < Math.min(grid.length, 40); i++) {
    const cells = grid[i].map(str);
    const nonEmpty = cells.filter(Boolean);
    if (nonEmpty.length < 2) continue;
    let score = 0;
    for (const c of nonEmpty) {
      if (H.date.test(c)) score += 2;
      if (H.description.test(c)) score += 2;
      if (H.amount.test(c) || H.debit.test(c) || H.credit.test(c)) score += 2;
      if (H.balance.test(c)) score += 1;
      if (parseAmountToMinor(c) !== null && /\d/.test(c)) score -= 2;
    }
    if (score >= 4) return i;
  }
  return -1;
}

/** Deterministic, heuristic column mapping. Used when AI is unavailable and as a cross-check. */
export function detectMapping(grid: Grid): ColumnMapping | null {
  const headerRow = findHeaderRow(grid);
  const width = Math.max(...grid.slice(0, 50).map((r) => r.length), 0);
  const mapping: ColumnMapping = {
    headerRowIndex: headerRow,
    dataStartRow: headerRow + 1,
    dateCol: -1,
    descriptionCols: [],
    amountMode: "single_signed",
    dateOrder: "DMY",
    negativeIsOut: true,
    skipRowPatterns: ["^(opening|closing|brought forward|carried forward|balance (b\\/f|c\\/f)|total|totals|sub-?total)\\b"],
  };
  const sample = grid.slice(mapping.dataStartRow, mapping.dataStartRow + 200);
  if (headerRow >= 0) {
    const headers = grid[headerRow].map(str);
    headers.forEach((h, i) => {
      if (!h) return;
      if (mapping.dateCol < 0 && H.date.test(h)) mapping.dateCol = i;
      else if (H.balance.test(h) && mapping.balanceCol == null) mapping.balanceCol = i;
      else if (H.debit.test(h) && !H.credit.test(h) && mapping.debitCol == null) mapping.debitCol = i;
      else if (H.credit.test(h) && !H.debit.test(h) && mapping.creditCol == null) mapping.creditCol = i;
      else if (H.type.test(h) && mapping.typeCol == null) mapping.typeCol = i;
      else if (H.currency.test(h) && mapping.currencyCol == null) mapping.currencyCol = i;
      else if (H.amount.test(h) && mapping.amountCol == null) mapping.amountCol = i;
      else if (H.reference.test(h) && mapping.referenceCol == null) mapping.referenceCol = i;
      else if (H.description.test(h)) mapping.descriptionCols.push(i);
    });
  }
  // Positional inference for anything still missing
  const colStats = Array.from({ length: width }, (_, i) => {
    let dates = 0, nums = 0, texts = 0, textLen = 0;
    for (const r of sample) {
      const v = str(r[i]);
      if (!v) continue;
      if (parseStatementDate(v)) dates++;
      else if (parseAmountToMinor(v) !== null) nums++;
      else {
        texts++;
        textLen += v.length;
      }
    }
    return { i, dates, nums, texts, avgLen: texts ? textLen / texts : 0 };
  });
  if (mapping.dateCol < 0) {
    const best = colStats.filter((c) => c.dates > 0).sort((a, b) => b.dates - a.dates)[0];
    if (!best) return null;
    mapping.dateCol = best.i;
  }
  const used = new Set<number>([mapping.dateCol, mapping.balanceCol, mapping.debitCol, mapping.creditCol, mapping.amountCol, mapping.typeCol, mapping.currencyCol, mapping.referenceCol, ...mapping.descriptionCols].filter((x): x is number => typeof x === "number"));
  if (mapping.debitCol != null && mapping.creditCol != null) mapping.amountMode = "debit_credit";
  else if (mapping.amountCol != null && mapping.typeCol != null) mapping.amountMode = "amount_with_type";
  else if (mapping.amountCol == null) {
    const numeric = colStats.filter((c) => !used.has(c.i) && c.nums > sample.length * 0.5).sort((a, b) => a.i - b.i);
    if (numeric.length >= 3 && mapping.balanceCol == null) {
      // debit, credit, balance in order
      mapping.debitCol = numeric[0].i;
      mapping.creditCol = numeric[1].i;
      mapping.balanceCol = numeric[2].i;
      mapping.amountMode = "debit_credit";
    } else if (numeric.length === 2) {
      // Could be amount+balance or debit+credit. If both columns are rarely both filled -> debit/credit
      let bothFilled = 0, either = 0;
      for (const r of sample) {
        const a = str(r[numeric[0].i]), b = str(r[numeric[1].i]);
        if (a && b) bothFilled++;
        if (a || b) either++;
      }
      if (either && bothFilled / either < 0.2) {
        mapping.debitCol = numeric[0].i;
        mapping.creditCol = numeric[1].i;
        mapping.amountMode = "debit_credit";
      } else {
        mapping.amountCol = numeric[0].i;
        mapping.balanceCol = numeric[1].i;
      }
    } else if (numeric.length >= 1) mapping.amountCol = numeric[0].i;
    else return null;
  }
  if (mapping.descriptionCols.length === 0) {
    const used2 = new Set<number>([mapping.dateCol, mapping.balanceCol, mapping.debitCol, mapping.creditCol, mapping.amountCol, mapping.typeCol, mapping.currencyCol, mapping.referenceCol].filter((x): x is number => typeof x === "number"));
    const text = colStats.filter((c) => !used2.has(c.i) && c.texts > 0).sort((a, b) => b.avgLen - a.avgLen)[0];
    if (text) mapping.descriptionCols = [text.i];
  }
  if (mapping.amountMode === "amount_with_type" && mapping.typeCol != null) {
    const vals = new Set(sample.map((r) => str(r[mapping.typeCol!]).toUpperCase()).filter(Boolean));
    mapping.typeDebitValues = [...vals].filter((v) => /^(DR|D|DEBIT|DB|OUT|WITHDRAWAL|PAYMENT|PURCHASE|EXPENSE)$/.test(v));
  }
  mapping.dateOrder = inferDateOrder(sample.map((r) => str(r[mapping.dateCol])));
  return mapping;
}

export function inferDateOrder(values: string[]): "DMY" | "MDY" | "YMD" {
  let dmy = 0, mdy = 0, ymd = 0;
  for (const v of values) {
    if (/^\d{4}[-/.]/.test(v)) { ymd++; continue; }
    const m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/);
    if (!m) continue;
    if (+m[1] > 12) dmy++;
    if (+m[2] > 12) mdy++;
  }
  if (ymd > dmy && ymd > mdy) return "YMD";
  if (mdy > dmy) return "MDY";
  return "DMY";
}

/** Applies a mapping to the whole grid. Pure and deterministic: numbers come straight from the file. */
export function applyMapping(grid: Grid, m: ColumnMapping, defaults: { currency: string; fallbackYear?: number }): ParsedTxn[] {
  const out: ParsedTxn[] = [];
  const skip = (m.skipRowPatterns ?? []).map((p) => {
    try { return new RegExp(p, "i"); } catch { return null; }
  }).filter((r): r is RegExp => Boolean(r));
  for (let i = Math.max(0, m.dataStartRow); i < grid.length; i++) {
    const row = grid[i];
    const cells = row.map(str);
    const joined = cells.filter(Boolean).join(" ");
    if (!joined) continue;
    const dateRaw = cells[m.dateCol] ?? "";
    const descRaw = m.descriptionCols.map((c) => cells[c] ?? "").filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    if (skip.some((r) => r.test(joined) || r.test(descRaw))) continue;
    let amountMinor: number | null = null;
    const issues: string[] = [];
    if (m.amountMode === "debit_credit") {
      const d = m.debitCol != null ? parseAmountToMinor(cells[m.debitCol]) : null;
      const c = m.creditCol != null ? parseAmountToMinor(cells[m.creditCol]) : null;
      if (d !== null && d !== 0 && (c === null || c === 0)) amountMinor = -Math.abs(d);
      else if (c !== null && c !== 0 && (d === null || d === 0)) amountMinor = Math.abs(c);
      else if (d !== null && c !== null && d !== 0 && c !== 0) { amountMinor = Math.abs(c) - Math.abs(d); issues.push("both_debit_and_credit"); }
    } else if (m.amountMode === "amount_with_type") {
      const a = m.amountCol != null ? parseAmountToMinor(cells[m.amountCol]) : null;
      const t = (m.typeCol != null ? cells[m.typeCol] : "").toUpperCase();
      if (a !== null) {
        const debitVals = (m.typeDebitValues ?? ["DR", "D", "DEBIT", "DB", "OUT", "WITHDRAWAL"]).map((v) => v.toUpperCase());
        const isOut = debitVals.includes(t) || (a < 0 && !t);
        amountMinor = isOut ? -Math.abs(a) : Math.abs(a);
      }
    } else {
      const a = m.amountCol != null ? parseAmountToMinor(cells[m.amountCol]) : null;
      if (a !== null) amountMinor = m.negativeIsOut ? a : -a;
    }
    const date = parseStatementDate(dateRaw, m.dateOrder, defaults.fallbackYear);
    if (!dateRaw && amountMinor === null) continue; // blank/continuation line
    if (!date) issues.push("unparsed_date");
    if (amountMinor === null) issues.push("unparsed_amount");
    const balance = m.balanceCol != null ? parseAmountToMinor(cells[m.balanceCol]) : null;
    const currency = (m.currencyCol != null && cells[m.currencyCol] && /^[A-Z]{3}$/i.test(cells[m.currencyCol]) ? cells[m.currencyCol].toUpperCase() : defaults.currency);
    out.push({
      rowIndex: i,
      date,
      description: descRaw || "(no description)",
      amountMinor,
      balanceAfterMinor: balance,
      reference: m.referenceCol != null ? cells[m.referenceCol] || null : null,
      currency,
      raw: Object.fromEntries(cells.map((c, idx) => [`c${idx}`, c])),
      issues,
    });
  }
  return out;
}
