import { eq, sql, inArray } from "drizzle-orm";
import { getDb, schema } from "../db";
import { getFile } from "../storage";
import { getAnthropic } from "../ai/client";
import { parseCsv, parseXlsx, gridToText, type Grid } from "../parsers/tabular";
import { extractPdfText } from "../parsers/pdf";
import { detectMapping, applyMapping } from "./mapping";
import { aiColumnMapping, aiExtractStatement, aiRecheck, extractionToTxns, aiCategorize, type Extraction } from "./ai";
import { reconcile, chronological } from "./reconcile";
import { parseKnownLayout } from "./bank-layouts";
import { fingerprintBase, fingerprintWithIndex } from "../fingerprint";
import { normalizeMerchantKey, titleCase } from "../utils";
import { toMinor } from "../money";
import type { ParsedTxn, ParseResult, StatementMeta, ColumnMapping } from "./types";
import type { BatchStats, Reconciliation } from "../db/schema";

type AI = NonNullable<Awaited<ReturnType<typeof getAnthropic>>>;

async function setStage(batchId: string, stage: string, progress: number) {
  const db = await getDb();
  await db.update(schema.importBatches).set({ stage, progress, status: "PROCESSING" }).where(eq(schema.importBatches.id, batchId));
}

export function mimeFor(fileType: string, fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop();
  if (fileType === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

export function fileTypeFor(fileName: string): "csv" | "xlsx" | "pdf" | "image" | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (["csv", "tsv", "txt"].includes(ext)) return "csv";
  if (["xlsx", "xls", "xlsm"].includes(ext)) return "xlsx";
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) return "image";
  return null;
}

// ---------------- Tabular (CSV / Excel) ----------------
async function parseTabular(grid: Grid, accountCurrency: string, ai: AI | null): Promise<ParseResult> {
  const notes: string[] = [];
  const heuristic = detectMapping(grid);
  let mapping: ColumnMapping | null = heuristic;
  let engine: "ai" | "heuristic" = "heuristic";
  const meta: StatementMeta = { currency: accountCurrency };
  if (ai) {
    try {
      const m = await aiColumnMapping(ai, gridToText(grid, 30), accountCurrency);
      const aiMapping: ColumnMapping = { ...m, typeDebitValues: m.typeDebitValues, skipRowPatterns: m.skipRowPatterns };
      const aiRows = applyMapping(grid, aiMapping, { currency: m.statementCurrency ?? accountCurrency });
      const heuRows = heuristic ? applyMapping(grid, heuristic, { currency: accountCurrency }) : [];
      const score = (rows: ParsedTxn[]) => rows.filter((r) => r.issues.length === 0).length;
      if (score(aiRows) >= score(heuRows)) {
        mapping = aiMapping;
        engine = "ai";
        if (m.statementCurrency) meta.currency = m.statementCurrency;
        if (m.bank) meta.bank = m.bank;
        if (typeof m.openingBalance === "number") meta.openingBalanceMinor = toMinor(m.openingBalance);
        if (typeof m.closingBalance === "number") meta.closingBalanceMinor = toMinor(m.closingBalance);
        if (m.notes) notes.push(m.notes);
      } else notes.push("AI column mapping produced fewer valid rows than the deterministic mapping; deterministic mapping used.");
    } catch (e) {
      notes.push(`AI mapping unavailable (${(e as Error).message}); deterministic mapping used.`);
    }
  }
  if (!mapping) throw new Error("Could not detect the date and amount columns in this file. Check that it is a transaction export.");
  const txns = applyMapping(grid, mapping, { currency: meta.currency ?? accountCurrency });
  if (txns.length === 0) throw new Error("No transaction rows were found in this file.");
  // Derive opening/closing from running balance column when present (chronological order)
  const chrono = chronological(txns).filter((t) => t.date && t.amountMinor !== null);
  const withBal = chrono.filter((t) => typeof t.balanceAfterMinor === "number");
  if (withBal.length >= 2) {
    meta.openingBalanceMinor ??= withBal[0].balanceAfterMinor! - withBal[0].amountMinor!;
    meta.closingBalanceMinor ??= withBal[withBal.length - 1].balanceAfterMinor!;
  }
  if (chrono.length) {
    meta.periodStart ??= chrono[0].date;
    meta.periodEnd ??= chrono[chrono.length - 1].date;
  }
  return { engine, txns, meta, mapping, notes };
}

// ---------------- PDF / image ----------------
async function parseDocument(buffer: Buffer, mime: string, accountCurrency: string, ai: AI | null, text: string | null): Promise<ParseResult> {
  // 1) Known bank layouts: fully deterministic and verified row-by-row against the printed running balance.
  if (text && text.trim()) {
    const known = parseKnownLayout(text);
    if (known) {
      const check = reconcile(known.txns.map((t) => ({ ...t, issues: [...t.issues] })), { ...known.meta }, null, "heuristic");
      if (check.ok || !ai) {
        known.notes.unshift(`Recognised ${known.meta.bank ?? "bank"} statement layout — parsed deterministically from the PDF text layer.`);
        return known;
      }
    }
  }
  if (!ai) {
    if (text && text.trim()) return heuristicPdf(text, accountCurrency);
    throw new Error("AI parsing is not configured. Add your Anthropic API key in Settings to import PDF and image statements.");
  }
  let ex: Extraction = await aiExtractStatement(ai, { buffer, mime }, text);
  let best = extractionToTxns(ex);
  best.meta.currency ??= accountCurrency;
  let recon = reconcile(best.txns.map((t) => ({ ...t, issues: [...t.issues] })), { ...best.meta }, text, "ai");
  const notes = [...best.notes];
  // Self-correction loop: when verification fails, ask the model to re-read with the discrepancy spelled out (max 2 passes)
  for (let attempt = 0; attempt < 2 && !recon.ok; attempt++) {
    const problems = recon.checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`);
    try {
      const ex2 = await aiRecheck(ai, { buffer, mime }, ex, problems);
      const cand = extractionToTxns(ex2);
      cand.meta.currency ??= accountCurrency;
      const r2 = reconcile(cand.txns.map((t) => ({ ...t, issues: [...t.issues] })), { ...cand.meta }, text, "ai");
      const better = r2.ok || (r2.checks.filter((c) => c.ok).length > recon.checks.filter((c) => c.ok).length) || (Math.abs(r2.diffMinor ?? 0) < Math.abs(recon.diffMinor ?? 0));
      if (better) {
        ex = ex2;
        best = cand;
        recon = r2;
        notes.push(`Verification pass ${attempt + 2}: ${r2.ok ? "all checks passed" : "improved but not fully reconciled"}`);
      } else break;
    } catch (e) {
      notes.push(`Re-check pass failed: ${(e as Error).message}`);
      break;
    }
  }
  return { engine: "ai", txns: best.txns, meta: best.meta, textForVerification: text, notes };
}

/** Best-effort text-layer parser used only when no API key is configured. Signs are derived from running-balance deltas when present. */
export function heuristicPdf(text: string, currency: string): ParseResult {
  const { parseAmountToMinor } = require("../money") as typeof import("../money");
  const { parseStatementDate } = require("../dates") as typeof import("../dates");
  const rawLines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  // Merge wrapped numeric continuation lines (e.g. a running balance printed on the next line) into the transaction line
  const lines: string[] = [];
  for (const l of rawLines) {
    if (lines.length && /^[-()\d,.\s]+$/.test(l) && /\d/.test(l) && /^\d{1,2}[\s\/\-.]|^\d{4}-|^[A-Za-z]{3}\s+\d/.test(lines[lines.length - 1])) lines[lines.length - 1] += " " + l;
    else lines.push(l);
  }
  const txns: ParsedTxn[] = [];
  const dateRe = /^(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\.?\s*\d{0,4}|\d{4}-\d{2}-\d{2}|[A-Za-z]{3}\s+\d{1,2},?\s*\d{0,4})\s+(.*)$/;
  // Amounts must have exactly two decimals; thousands separated by commas only (a space would merge reference numbers into amounts)
  const amtRe = /(?<![\d,.])(-?\(?[£$€₹]?\d{1,3}(?:,\d{3})*\.\d{2}\)?(?:\s?(?:CR|DR)\b)?)(?![\d,])/gi;
  const meta: StatementMeta = { currency };
  const pick = (re: RegExp) => { const m = text.match(re); return m ? parseAmountToMinor(m[1]) : null; };
  meta.openingBalanceMinor = pick(/opening balance[^0-9\-]*(-?[\d,]+\.\d{2})/i);
  meta.closingBalanceMinor = pick(/closing balance[^0-9\-]*(-?[\d,]+\.\d{2})/i);
  meta.totalCreditsMinor = pick(/total (?:paid in|credits|deposits|money in)[^0-9]*([\d,]+\.\d{2})/i);
  meta.totalDebitsMinor = pick(/total (?:paid out|debits|withdrawals|money out)[^0-9]*([\d,]+\.\d{2})/i);
  const period = text.match(/period[^0-9A-Za-z]*(\d{1,2}[\s\/\-.][A-Za-z0-9]{1,9}[\s\/\-.]\d{2,4})\s*(?:to|-|–)\s*(\d{1,2}[\s\/\-.][A-Za-z0-9]{1,9}[\s\/\-.]\d{2,4})/i);
  if (period) { meta.periodStart = parseStatementDate(period[1]); meta.periodEnd = parseStatementDate(period[2]); }
  let prevBalance: number | null = meta.openingBalanceMinor ?? null;
  lines.forEach((line, idx) => {
    const m = line.match(dateRe);
    if (!m) return;
    if (/^(opening|closing) balance/i.test(m[2])) return;
    const amounts = [...m[2].matchAll(amtRe)].map((x) => x[1]);
    if (amounts.length === 0) return;
    const hasBalance = amounts.length >= 2;
    const amountStr = amounts[hasBalance ? amounts.length - 2 : 0];
    const balance = hasBalance ? parseAmountToMinor(amounts[amounts.length - 1]) : null;
    let amount = parseAmountToMinor(amountStr);
    const issues: string[] = ["heuristic_pdf"];
    if (amount !== null && balance !== null && prevBalance !== null) {
      const delta = balance - prevBalance;
      if (Math.abs(delta) === Math.abs(amount)) amount = delta; // sign from the running balance — deterministic
      else issues.push("balance_break");
    } else if (amount !== null && amount > 0 && /\b(DR|debit|paid out|withdrawal)\b/i.test(line)) amount = -amount;
    if (balance !== null) prevBalance = balance;
    const desc = m[2].replace(amtRe, "").replace(/\s+/g, " ").trim();
    txns.push({ rowIndex: idx, date: parseStatementDate(m[1]), description: desc, amountMinor: amount, balanceAfterMinor: balance, currency, raw: { line }, issues });
  });
  if (!txns.length) throw new Error("Could not read transactions from this PDF without AI. Add your Anthropic API key in Settings.");
  return { engine: "heuristic", txns, meta, notes: ["Parsed from the PDF text layer without AI — review every row carefully. Add an Anthropic API key in Settings for full AI reading and verification."] };
}


export const TRANSFER_RE = /\b(ownacc|own acc|ownaccount|self transfer|to own|own account)\b|\/own\/|grown3860|impstxn\/liveright/i;

/** The original UPI reference a reversal credit cancels, or null when the row is not a reversal. */
export function reversalOf(description: string): string | null {
  return /UPI\/RVSL(\d+)\//i.exec(description)?.[1] ?? null;
}

// Merchant knowledge used when no learned rule or recurring payment matches. Order matters: first match wins.
export const KEYWORDS: [RegExp, string, "INCOME" | "EXPENSE"][] = [
  // ---- income ----
  [/razorpay|stripe|paypal|payoneer|wise payme|rdavostro|payment from|bizflix|edusoftware|bil\/inft|\binst(al|alment)?\b|first ?inst|final ?inst|gtv|sentusing|client|invoice|consult|fee\b/i, "Client Fees", "INCOME"],
  [/returnofloan|return of loan|loanreturn|loan rec|\bloan\b/i, "Loan Received", "INCOME"],
  [/owner|capital|investment|\/mr shailen\/|9999311087@ptye/i, "Owner Investment", "INCOME"],
  [/jayvora14|gurmanjot kaur|shashi kant bahl/i, "Client Fees", "INCOME"],
  [/interest/i, "Interest Income", "INCOME"],
  [/refund|reversal|\brev\b/i, "Refunds Received", "INCOME"],
  [/commission|referral/i, "Partner Commissions", "INCOME"],
  // ---- expenses ----
  [/\bchg\b|charges|nmqab|bank charge|annual fee|service charge|sms charge|\bfee\b/i, "Bank Fees & Charges", "EXPENSE"],
  [/\binterest\b|\bint\b|intfeb|intmarch|intapril|intdec|juneinterest|monaintere|monamankhand|gauravmank|\breturn\b/i, "Loan Repayment", "EXPENSE"],
  [/supabase|vercel|netlify|cloudflare|digitalocean|heroku|render\.com|openrouter|elevenlabs|twilio|sendgrid|mailchimp|brevo/i, "Software & Subscriptions", "EXPENSE"],
  [/\bsal\b|\bfl\b|deepanshu/i, "Salaries & Contractors", "EXPENSE"],
  [/payment to/i, "Client Fees", "INCOME"],
  [/reim|reimburse/i, "Staff Reimbursements", "EXPENSE"],
  [/salary|incentive|freelancer|contractor|stipend|payroll|wages|upwork|fiverr|mansibehl|shailenidf|prateekmig|bhaskardes|sandriya|manishaeco|adarshvats|bhaskarjani/i, "Salaries & Contractors", "EXPENSE"],
  [/gyanpinky|gyanfl|\/[a-z]{3}fl\/|comission|bhaskar ?des|idfb0021271/i, "Salaries & Contractors", "EXPENSE"],
  [/\btds[a-z]{3}\b/i, "Taxes", "EXPENSE"],
  [/XXpayu@|XXbook@payuaxi|\bmeta ?ads\b|\/meta\/|sandeephtarticl|msprimexmedia/i, "Marketing & Ads", "EXPENSE"],
  [/goelgaurav705|zohocorporation|interakt|rzpvddgrvintera|XXrakt@|billdeskpg\.micr/i, "Software & Subscriptions", "EXPENSE"],
  [/\/ofcelec\/|radiussynergies/i, "Utilities & Telecom", "EXPENSE"],
  [/neelambehal50|monajeetma/i, "Loan Repayment", "EXPENSE"],
  [/8700767120|8287742578|9999311087@ptye/i, "Owner Drawings", "EXPENSE"],
  [/prabhjotkaur610/i, "Client Refunds", "EXPENSE"],
  [/hitsbotgaming|zeptomarke|\/zepto\/|blinkitgro|\/blinkit\/|blinkcomme/i, "Office & Rent", "EXPENSE"],
  [/\bgst\b|karnatakagst|incomet|income ?tax|\btds\b|eportal|hmrc|\bvat\b|\birs\b|\btax/i, "Taxes", "EXPENSE"],
  [/facebook|fb ads|linkedin|google ads|adsman|meta ads|instagram|advert/i, "Marketing & Ads", "EXPENSE"],
  [/anthropic|openai|chatgpt|claude|turnitin|google|gsuite|microsoft|zoom|canva|notion|slack|\baws\b|amazon web|github|kinsta|hostinger|godaddy|namecheap|adobe|figma|dropbox|hubspot|zapier|apple\.com|subscription|grammarly|quillbot|ithenticate/i, "Software & Subscriptions", "EXPENSE"],
  [/cafee|ca fee|chartered|legal|advocate|lawyer|audit|compliance|deepanshun|accountant/i, "Legal & Professional", "EXPENSE"],
  [/patentreg|patent|stamps|companyname|\bmca\b|\broc\b|registrar|govt|government|visa fee|ukvi|uscis|\bihs\b|home office|trademark/i, "Government & Visa Fees", "EXPENSE"],
  [/www amazon|amazon|flipkart|laptop|printer|equipment|croma|reliance digital/i, "Equipment", "EXPENSE"],
  [/shopemi|\bemi\b|loan|funding|interestonloan|interst|repayment/i, "Loan Repayment", "EXPENSE"],
  [/\brent\b|shopmaintenance|mygate|maintenance|electric|courier|office|wework|regus|coworking|stationery/i, "Office & Rent", "EXPENSE"],
  [/uber|\bola\b|irctc|indigo|airindia|air india|makemytrip|hotel|travel|flight|\brail|airline|airways|booking\.com|airbnb|taxi/i, "Travel", "EXPENSE"],
  [/swiggy|zomato|food|restaurant|cafe|coffee|starbucks|deliveroo|ubereats/i, "Meals & Entertainment", "EXPENSE"],
  [/paytm|recharge|airtel|\bjio\b|vodafone|broadband|bsnl|mobile|telecom|utility|\bwater\b|\bgas\b/i, "Utilities & Telecom", "EXPENSE"],
  [/insurance|\blic\b|policy/i, "Insurance", "EXPENSE"],
  [/course|udemy|coursera|training|education|workshop/i, "Education & Training", "EXPENSE"],
  [/refund|reversal/i, "Client Refunds", "EXPENSE"],
  [/drawing|owner|personal/i, "Owner Drawings", "EXPENSE"],
];

/** Keyword-based suggestion for a single description (used by the pipeline and by re-categorization tools). */
export function keywordCategory(description: string, type: "INCOME" | "EXPENSE"): string | null {
  const kw = KEYWORDS.find(([re, , ty]) => ty === type && re.test(description));
  return kw ? kw[1] : null;
}

// ---------------- Categorization ----------------
async function categorize(txns: ParsedTxn[], accountId: string, ai: AI | null) {
  const db = await getDb();
  const [cats, rules, recurring, accounts, settingsRows] = await Promise.all([
    db.select().from(schema.categories),
    db.select().from(schema.categoryRules),
    db.select().from(schema.recurringPayments).where(eq(schema.recurringPayments.isActive, true)),
    db.select().from(schema.accounts),
    db.select().from(schema.settings).limit(1),
  ]);
  const byType = { INCOME: cats.filter((c) => c.type === "INCOME"), EXPENSE: cats.filter((c) => c.type === "EXPENSE") };
  const ruleMap = new Map(rules.map((r) => [r.pattern, r]));
  const result = new Map<number, { categoryId: string | null; merchant: string | null; confidence: number; type: "INCOME" | "EXPENSE" | "TRANSFER"; recurringId?: string | null; source: string }>();
  const pendingAi: ParsedTxn[] = [];

  for (const t of txns) {
    if (t.amountMinor === null) continue;
    const type: "INCOME" | "EXPENSE" = t.amountMinor > 0 ? "INCOME" : "EXPENSE";
    const key = normalizeMerchantKey(t.description);
    // 1) Learned rules (user-confirmed) — exact key, then prefix match on ≥2 words
    let rule = ruleMap.get(key);
    if (!rule && key.includes(" ")) {
      const first2 = key.split(" ").slice(0, 2).join(" ");
      rule = rules.find((r) => r.pattern === first2 || (r.pattern.includes(" ") && key.startsWith(r.pattern)));
    }
    const ruleCat = rule ? cats.find((c) => c.id === rule!.categoryId) : null;
    if (ruleCat && ruleCat.type === type) {
      result.set(t.rowIndex, { categoryId: ruleCat.id, merchant: rule!.merchantLabel ? titleCase(rule!.merchantLabel) : titleCase(key), confidence: rule!.source === "USER" ? 0.97 : 0.85, type, source: "rule" });
      continue;
    }
    // 2) Recurring payment match
    const rec = recurring.find((r) => r.merchantPattern && t.description.toUpperCase().includes(r.merchantPattern.toUpperCase()) && Math.sign(r.amountMinor) === Math.sign(t.amountMinor!));
    if (rec) {
      result.set(t.rowIndex, { categoryId: rec.categoryId, merchant: rec.name, confidence: 0.93, type, recurringId: rec.id, source: "recurring" });
      continue;
    }
    pendingAi.push(t);
  }

  // 3) AI categorization for the rest
  if (ai && pendingAi.length) {
    try {
      const map = await aiCategorize(
        ai,
        pendingAi.map((t) => ({ index: t.rowIndex, description: t.description, amountMinor: t.amountMinor!, currency: t.currency ?? "", reference: t.reference })),
        cats.map((c) => ({ id: c.id, name: c.name, type: c.type })),
        settingsRows[0]?.businessName ?? "Migrizo",
        accounts.map((a) => `${a.name}${a.lastFour ? " ••••" + a.lastFour : ""}`),
      );
      for (const t of pendingAi) {
        const a = map.get(t.rowIndex);
        const type: "INCOME" | "EXPENSE" = t.amountMinor! > 0 ? "INCOME" : "EXPENSE";
        if (!a) continue;
        const cat = a.categoryId ? cats.find((c) => c.id === a.categoryId) : null;
        result.set(t.rowIndex, { categoryId: cat && cat.type === type ? cat.id : null, merchant: a.merchant || null, confidence: a.confidence, type: a.isTransfer ? "TRANSFER" : type, source: "ai" });
      }
    } catch (e) {
      console.error("AI categorization failed", e);
    }
  }
  // 4) Built-in merchant knowledge for anything still unassigned (first match wins; type-checked)
  for (const t of txns) {
    if (t.amountMinor === null || result.has(t.rowIndex)) continue;
    const type: "INCOME" | "EXPENSE" = t.amountMinor > 0 ? "INCOME" : "EXPENSE";
    const merchant = titleCase(normalizeMerchantKey(t.description)) || null;
    if (TRANSFER_RE.test(t.description)) {
      result.set(t.rowIndex, { categoryId: null, merchant: merchant ?? "Own account transfer", confidence: 0.85, type: "TRANSFER", source: "keyword" });
      continue;
    }
    const kw = KEYWORDS.find(([re, , ty]) => ty === type && re.test(t.description));
    const cat = kw ? byType[type].find((c) => c.name === kw[1]) : null;
    result.set(t.rowIndex, { categoryId: cat?.id ?? null, merchant, confidence: cat ? 0.7 : 0.2, type, source: "keyword" });
  }
  // 5) A failed payment and its reversal cancel out, so neither is income or an expense.
  for (const t of txns) {
    const ref = reversalOf(t.description);
    const original = ref ? txns.find((o) => o.description.includes(`UPI/${ref}/`)) : null;
    if (!original) continue;
    for (const x of [t, original]) {
      const cur = result.get(x.rowIndex);
      if (cur) result.set(x.rowIndex, { ...cur, categoryId: null, confidence: 0.9, type: "TRANSFER" });
    }
  }
  return result;
}

// ---------------- Duplicates ----------------
async function dedupe(txns: ParsedTxn[], accountId: string) {
  const db = await getDb();
  const bases = new Map<number, string>();
  for (const t of txns) if (t.date && t.amountMinor !== null) bases.set(t.rowIndex, fingerprintBase(accountId, t.date, t.amountMinor, t.description));
  const uniqueBases = [...new Set(bases.values())];
  const existingCount = new Map<string, number>();
  if (uniqueBases.length) {
    const rows = await db
      .select({ base: sql<string>`split_part(${schema.transactions.fingerprint}, '#', 1)`, n: sql<number>`count(*)::int` })
      .from(schema.transactions)
      .where(inArray(sql`split_part(${schema.transactions.fingerprint}, '#', 1)`, uniqueBases))
      .groupBy(sql`split_part(${schema.transactions.fingerprint}, '#', 1)`);
    for (const r of rows) existingCount.set(r.base, Number(r.n));
  }
  const seen = new Map<string, number>();
  const out = new Map<number, { fingerprint: string; isDuplicate: boolean }>();
  for (const t of txns) {
    const base = bases.get(t.rowIndex);
    if (!base) continue;
    const k = (seen.get(base) ?? 0) + 1;
    seen.set(base, k);
    out.set(t.rowIndex, { fingerprint: fingerprintWithIndex(base, k), isDuplicate: k <= (existingCount.get(base) ?? 0) });
  }
  return out;
}

// ---------------- Pipeline ----------------
export async function runImportPipeline(batchId: string) {
  const db = await getDb();
  const batch = await db.query.importBatches.findFirst({ where: eq(schema.importBatches.id, batchId), with: { account: true } });
  if (!batch) throw new Error("Batch not found");
  if (batch.status === "COMMITTED") return;
  try {
    await setStage(batchId, "Reading file", 5);
    const buffer = await getFile(batch.storagePath);
    const ai = await getAnthropic();
    const accountCurrency = batch.account.currency;
    let result: ParseResult;
    if (batch.fileType === "csv") {
      await setStage(batchId, ai ? "Mapping columns with AI" : "Mapping columns", 20);
      result = await parseTabular(parseCsv(buffer), accountCurrency, ai);
    } else if (batch.fileType === "xlsx") {
      await setStage(batchId, ai ? "Mapping columns with AI" : "Mapping columns", 20);
      result = await parseTabular(parseXlsx(buffer).grid, accountCurrency, ai);
    } else {
      await setStage(batchId, "Extracting text layer", 15);
      const text = batch.fileType === "pdf" ? (await extractPdfText(buffer)).text : null;
      await setStage(batchId, "Reading statement with AI (this can take a minute)", 30);
      result = await parseDocument(buffer, mimeFor(batch.fileType, batch.fileName), accountCurrency, ai, text);
    }
    await setStage(batchId, "Verifying totals and balances", 60);
    const recon: Reconciliation = reconcile(result.txns, result.meta, result.textForVerification, result.engine);
    await setStage(batchId, ai ? "Categorizing with AI" : "Categorizing", 70);
    const cat = await categorize(result.txns, batch.accountId, ai);
    await setStage(batchId, "Checking for duplicates", 88);
    const dup = await dedupe(result.txns, batch.accountId);
    await setStage(batchId, "Saving review", 95);

    const rows = result.txns.map((t) => {
      const c = cat.get(t.rowIndex);
      const d = dup.get(t.rowIndex);
      const flags = [...new Set(t.issues)];
      if (d?.isDuplicate) flags.push("duplicate");
      if (c?.categoryId && (c?.confidence ?? 0) < 0.6 && !flags.includes("duplicate")) flags.push("low_confidence");
      return {
        batchId,
        rowIndex: t.rowIndex,
        date: t.date,
        description: t.description,
        merchant: c?.merchant ?? null,
        amountMinor: t.amountMinor,
        currency: (t.currency ?? result.meta.currency ?? accountCurrency).toUpperCase(),
        balanceAfterMinor: t.balanceAfterMinor ?? null,
        reference: t.reference ?? null,
        type: c?.type ?? (t.amountMinor !== null && t.amountMinor > 0 ? "INCOME" : "EXPENSE"),
        categoryId: c?.categoryId ?? null,
        confidence: c?.confidence ?? 0,
        flags,
        isDuplicate: Boolean(d?.isDuplicate),
        include: Boolean(d && !d.isDuplicate && t.date && t.amountMinor !== null),
        raw: { ...t.raw, fingerprint: d?.fingerprint ?? null, recurringId: c?.recurringId ?? null, source: c?.source ?? null },
      } satisfies typeof schema.importRows.$inferInsert;
    });

    const stats: BatchStats = {
      rows: rows.length,
      included: rows.filter((r) => r.include).length,
      duplicates: rows.filter((r) => r.isDuplicate).length,
      flagged: rows.filter((r) => r.flags.some((f) => f !== "duplicate")).length,
      creditsMinor: rows.filter((r) => (r.amountMinor ?? 0) > 0).reduce((a, r) => a + (r.amountMinor ?? 0), 0),
      debitsMinor: rows.filter((r) => (r.amountMinor ?? 0) < 0).reduce((a, r) => a + Math.abs(r.amountMinor ?? 0), 0),
      categorized: rows.filter((r) => r.categoryId).length,
    };

    await db.transaction(async (tx) => {
      await tx.delete(schema.importRows).where(eq(schema.importRows.batchId, batchId));
      for (let i = 0; i < rows.length; i += 200) await tx.insert(schema.importRows).values(rows.slice(i, i + 200));
      await tx
        .update(schema.importBatches)
        .set({
          status: "REVIEW",
          stage: "Ready for review",
          progress: 100,
          engine: result.engine,
          detected: { ...result.meta },
          stats,
          reconciliation: recon,
          mapping: { ...(result.mapping ?? {}), notes: result.notes },
          error: null,
        })
        .where(eq(schema.importBatches.id, batchId));
    });
  } catch (e) {
    const message = (e as Error).message || "Unknown error";
    console.error("Import pipeline failed", e);
    await db.update(schema.importBatches).set({ status: "FAILED", stage: "Failed", error: message }).where(eq(schema.importBatches.id, batchId));
  }
}
