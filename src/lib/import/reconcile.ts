import type { ParsedTxn, StatementMeta } from "./types";
import type { Reconciliation, ReconciliationCheck } from "../db/schema";
import { fromMinor } from "../money";

function fmtVariants(minor: number): string[] {
  const abs = Math.abs(fromMinor(minor));
  const fixed = abs.toFixed(2);
  const [int, dec] = fixed.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const groupedDot = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const groupedSpace = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const indian = int.length > 3 ? int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + int.slice(-3) : int;
  const v = [fixed, `${grouped}.${dec}`, `${groupedDot},${dec}`, `${groupedSpace}.${dec}`, `${groupedSpace},${dec}`, `${int},${dec}`, `${indian}.${dec}`];
  if (dec === "00") v.push(int, grouped, indian);
  return [...new Set(v)];
}

export function chronological(txns: ParsedTxn[]): ParsedTxn[] {
  const dated = txns.filter((t) => t.date);
  if (dated.length < 2) return txns;
  const first = dated[0].date!, last = dated[dated.length - 1].date!;
  return first > last ? [...txns].reverse() : txns;
}

export function reconcile(txnsIn: ParsedTxn[], meta: StatementMeta, text?: string | null, engine?: string): Reconciliation {
  const checks: ReconciliationCheck[] = [];
  const txns = chronological(txnsIn);
  const valid = txns.filter((t) => t.date && t.amountMinor !== null);
  const bad = txns.length - valid.length;
  checks.push({ name: "Every row has a date and an amount", ok: bad === 0, detail: bad === 0 ? `${txns.length} rows parsed` : `${bad} of ${txns.length} rows could not be parsed — review the flagged rows` });

  const sum = valid.reduce((a, t) => a + (t.amountMinor ?? 0), 0);
  let computedClosing: number | null = null;
  let diff: number | null = null;
  const hasOpen = typeof meta.openingBalanceMinor === "number";
  const hasClose = typeof meta.closingBalanceMinor === "number";
  if (hasOpen && hasClose) {
    computedClosing = meta.openingBalanceMinor! + sum;
    diff = computedClosing - meta.closingBalanceMinor!;
    checks.push({ name: "Opening balance + all transactions = closing balance", ok: Math.abs(diff) === 0, detail: Math.abs(diff) === 0 ? "Balances reconcile to the cent" : `Off by ${fromMinor(diff).toFixed(2)} — a transaction is missing, duplicated or has a wrong sign` });
  } else if (hasOpen || hasClose) {
    checks.push({ name: "Opening/closing balance check", ok: true, detail: "Only one balance was found on the statement; equation check skipped" });
  }

  const withBal = valid.filter((t) => typeof t.balanceAfterMinor === "number");
  if (withBal.length >= 2) {
    let breaks = 0;
    const breakRows: number[] = [];
    for (let i = 1; i < withBal.length; i++) {
      const prev = withBal[i - 1], cur = withBal[i];
      if (prev.balanceAfterMinor! + cur.amountMinor! !== cur.balanceAfterMinor!) { breaks++; breakRows.push(cur.rowIndex); cur.issues.push("balance_break"); }
    }
    if (hasOpen && withBal[0].balanceAfterMinor! !== meta.openingBalanceMinor! + withBal[0].amountMinor!) { breaks++; withBal[0].issues.push("balance_break"); }
    checks.push({ name: "Running balance continuity", ok: breaks === 0, detail: breaks === 0 ? `${withBal.length} running balances verified` : `${breaks} break(s) in the running balance (rows ${breakRows.slice(0, 5).join(", ")})` });
    if (!hasClose) {
      meta.closingBalanceMinor = withBal[withBal.length - 1].balanceAfterMinor!;
      if (!hasOpen) meta.openingBalanceMinor = withBal[0].balanceAfterMinor! - withBal[0].amountMinor!;
    }
  }

  const credits = valid.filter((t) => t.amountMinor! > 0).reduce((a, t) => a + t.amountMinor!, 0);
  const debits = valid.filter((t) => t.amountMinor! < 0).reduce((a, t) => a + Math.abs(t.amountMinor!), 0);
  if (typeof meta.totalCreditsMinor === "number") checks.push({ name: "Total credits match statement summary", ok: credits === meta.totalCreditsMinor, detail: credits === meta.totalCreditsMinor ? "Matches" : `Parsed ${fromMinor(credits).toFixed(2)} vs statement ${fromMinor(meta.totalCreditsMinor).toFixed(2)}` });
  if (typeof meta.totalDebitsMinor === "number") checks.push({ name: "Total debits match statement summary", ok: debits === meta.totalDebitsMinor, detail: debits === meta.totalDebitsMinor ? "Matches" : `Parsed ${fromMinor(debits).toFixed(2)} vs statement ${fromMinor(meta.totalDebitsMinor).toFixed(2)}` });

  if (text && text.trim().length > 50 && engine === "ai") {
    const hay = text.replace(/\s+/g, " ");
    let unverified = 0;
    for (const t of valid) {
      const ok = fmtVariants(t.amountMinor!).some((v) => hay.includes(v));
      if (!ok) { unverified++; t.issues.push("unverified_amount"); }
    }
    checks.push({ name: "Every amount cross-checked against the document text", ok: unverified === 0, detail: unverified === 0 ? `${valid.length} amounts found verbatim in the PDF` : `${unverified} amount(s) not found verbatim in the PDF text — flagged for review` });
  }

  if (meta.periodStart && meta.periodEnd) {
    const outside = valid.filter((t) => t.date! < meta.periodStart! || t.date! > meta.periodEnd!);
    outside.forEach((t) => t.issues.push("date_outside_period"));
    checks.push({ name: "Dates fall within the statement period", ok: outside.length === 0, detail: outside.length === 0 ? `${meta.periodStart} → ${meta.periodEnd}` : `${outside.length} row(s) dated outside ${meta.periodStart} → ${meta.periodEnd}` });
  }

  return { ok: checks.every((c) => c.ok), checks, computedClosingMinor: computedClosing, diffMinor: diff };
}
