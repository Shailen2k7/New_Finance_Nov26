import { z } from "zod/v4";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type Anthropic from "@anthropic-ai/sdk";
import type { ColumnMapping, StatementMeta, ParsedTxn } from "./types";
import { toMinor } from "../money";
import { parseStatementDate } from "../dates";

type AI = { client: Anthropic; model: string };

const MappingSchema = z.object({
  headerRowIndex: z.number().int(),
  dataStartRow: z.number().int(),
  dateCol: z.number().int(),
  descriptionCols: z.array(z.number().int()),
  amountMode: z.enum(["single_signed", "debit_credit", "amount_with_type"]),
  amountCol: z.number().int().nullable(),
  debitCol: z.number().int().nullable(),
  creditCol: z.number().int().nullable(),
  typeCol: z.number().int().nullable(),
  typeDebitValues: z.array(z.string()),
  balanceCol: z.number().int().nullable(),
  referenceCol: z.number().int().nullable(),
  currencyCol: z.number().int().nullable(),
  dateOrder: z.enum(["DMY", "MDY", "YMD"]),
  negativeIsOut: z.boolean(),
  skipRowPatterns: z.array(z.string()),
  statementCurrency: z.string().nullable(),
  bank: z.string().nullable(),
  openingBalance: z.number().nullable(),
  closingBalance: z.number().nullable(),
  notes: z.string(),
});

const SYSTEM = `You are a meticulous bank-statement data engineer for a small international business (immigration consultancy). Accuracy matters more than speed: a single wrong digit, sign or date is unacceptable. Never invent data. Money IN to the account is positive; money OUT is negative.`;

async function run<T>(ai: AI, schema: z.ZodType<T>, content: Anthropic.Beta.BetaContentBlockParam[], maxTokens = 32000, effort: "high" | "max" = "high"): Promise<T> {
  const stream = ai.client.beta.messages.stream({
    model: ai.model,
    max_tokens: maxTokens,
    system: SYSTEM,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort, format: betaZodOutputFormat(schema) },
    messages: [{ role: "user", content }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("The AI declined to process this document.");
  if (msg.stop_reason === "max_tokens") throw new Error("The statement is too long for one pass. Split the PDF into smaller files and import each.");
  if (msg.parsed_output) return msg.parsed_output as T;
  const text = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
  return schema.parse(JSON.parse(text));
}

export async function aiColumnMapping(ai: AI, sampleText: string, accountCurrency: string): Promise<ColumnMapping & { statementCurrency: string | null; bank: string | null; openingBalance: number | null; closingBalance: number | null }> {
  const prompt = `Below are the first rows of a bank statement export (CSV/Excel). Each line is "<rowIndex>\\t<col0> | <col1> | ...". Column indexes are 0-based, in the order shown.

Produce a column mapping so a deterministic program can convert EVERY data row into transactions:
- headerRowIndex: index of the header row, or -1 if none. dataStartRow: first row index containing a transaction.
- dateCol: the transaction/posting date column (prefer transaction date over value date).
- descriptionCols: columns to concatenate for the description (payee/narrative/details/type), in order.
- amountMode: "debit_credit" when separate money-out and money-in columns exist; "amount_with_type" when a single amount column plus a CR/DR (or Credit/Debit) type column; otherwise "single_signed".
- For single_signed: negativeIsOut=true when negative numbers are money leaving the account (normal bank export); false when positive numbers are charges/money out (common for credit-card exports where purchases are positive and payments negative).
- typeDebitValues: exact values in typeCol that mean money OUT (e.g. ["DR","Debit"]). Empty array if not applicable.
- balanceCol: running balance column if present. referenceCol, currencyCol if present, else null.
- dateOrder: infer from evidence (any day > 12 proves DMY vs MDY; bank country/currency hints; ISO = YMD). Default DMY only when there is no evidence of MDY.
- skipRowPatterns: case-insensitive regexes for non-transaction rows (opening/closing balance lines, totals, page headers) matched against the row's joined text. Keep them tight.
- statementCurrency: ISO code if evident, else null. bank: bank name if evident. openingBalance/closingBalance: numbers if stated in the file (e.g. a header block), else null.
- notes: anything a reviewer should know (max 2 sentences).

The account currency in our system is ${accountCurrency}.

ROWS:
${sampleText}`;
  const r = await run(ai, MappingSchema, [{ type: "text", text: prompt }], 8000);
  return { ...r, descriptionCols: r.descriptionCols.length ? r.descriptionCols : [], amountCol: r.amountCol, debitCol: r.debitCol, creditCol: r.creditCol, typeCol: r.typeCol, balanceCol: r.balanceCol, referenceCol: r.referenceCol, currencyCol: r.currencyCol };
}

const ExtractionSchema = z.object({
  bank: z.string().nullable(),
  accountHolder: z.string().nullable(),
  accountNumberMasked: z.string().nullable(),
  currency: z.string().nullable(),
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
  openingBalance: z.number().nullable(),
  closingBalance: z.number().nullable(),
  totalCredits: z.number().nullable(),
  totalDebits: z.number().nullable(),
  statementType: z.enum(["bank_account", "credit_card", "wallet", "other"]),
  transactions: z.array(
    z.object({
      date: z.string(),
      description: z.string(),
      amount: z.number(),
      balanceAfter: z.number().nullable(),
      reference: z.string().nullable(),
      page: z.number().int().nullable(),
    }),
  ),
  warnings: z.array(z.string()),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

const EXTRACT_PROMPT = `Extract EVERY transaction from this bank/card statement into the schema. Rules:
1. Exhaustive: include every transaction line on every page — fees, interest, reversals, small amounts. Do not merge, summarize or skip any. Do not include the opening/closing balance lines, subtotals, or "balance brought forward" as transactions.
2. Exact: copy amounts digit-for-digit (to the cent). Signs: money INTO the account positive, money OUT negative. For a credit-card statement, purchases/fees are money out (negative) and payments/refunds to the card are money in (positive); closingBalance is the amount owed shown on the statement and openingBalance the previous balance — report both as they are printed (positive numbers if printed that way) and note the convention in warnings.
3. Dates: ISO yyyy-mm-dd. Use the transaction/posting date (not the value date unless it is the only one). Resolve the year from the statement period. Keep the order as printed.
4. Description: the full narrative, joining continuation lines, without the date/amount repeated. reference: cheque/transaction reference if printed separately, else null.
5. balanceAfter: the running balance printed on that line, exactly, if the statement shows one; else null.
6. Summary fields: openingBalance, closingBalance, totalCredits (money in), totalDebits (money out, positive number) as printed in the statement summary, else null. periodStart/periodEnd ISO.
7. warnings: anything ambiguous (unreadable lines, assumed year, sign convention).`;

export async function aiExtractStatement(ai: AI, file: { buffer: Buffer; mime: string }, extractedText?: string | null): Promise<Extraction> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (file.mime === "application/pdf") content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: file.buffer.toString("base64") } });
  else content.push({ type: "image", source: { type: "base64", media_type: file.mime as "image/png" | "image/jpeg" | "image/webp" | "image/gif", data: file.buffer.toString("base64") } });
  let prompt = EXTRACT_PROMPT;
  if (extractedText && extractedText.trim().length > 50) prompt += `\n\nFor cross-checking, here is the raw text layer of the same document (may have layout noise; the rendered document is authoritative):\n<text_layer>\n${extractedText.slice(0, 150000)}\n</text_layer>`;
  content.push({ type: "text", text: prompt });
  return run(ai, ExtractionSchema, content, 64000, "high");
}

export async function aiRecheck(ai: AI, file: { buffer: Buffer; mime: string }, previous: Extraction, problems: string[]): Promise<Extraction> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (file.mime === "application/pdf") content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: file.buffer.toString("base64") } });
  else content.push({ type: "image", source: { type: "base64", media_type: file.mime as "image/png" | "image/jpeg" | "image/webp", data: file.buffer.toString("base64") } });
  content.push({
    type: "text",
    text: `${EXTRACT_PROMPT}\n\nA previous extraction of this exact document FAILED verification:\n- ${problems.join("\n- ")}\n\nPrevious extraction (JSON):\n${JSON.stringify(previous)}\n\nRe-read the document line by line, find the missing/duplicated/mis-signed/mis-typed entries, and return the complete corrected extraction. Every transaction must be present exactly once.`,
  });
  return run(ai, ExtractionSchema, content, 64000, "max");
}

export function extractionToTxns(ex: Extraction): { txns: ParsedTxn[]; meta: StatementMeta; notes: string[] } {
  const isCard = ex.statementType === "credit_card";
  const txns: ParsedTxn[] = ex.transactions.map((t, i) => {
    const date = parseStatementDate(t.date, "YMD");
    return {
      rowIndex: i,
      date,
      description: t.description.trim(),
      amountMinor: Number.isFinite(t.amount) ? toMinor(t.amount) : null,
      balanceAfterMinor: typeof t.balanceAfter === "number" ? toMinor(isCard ? -t.balanceAfter : t.balanceAfter) : null,
      reference: t.reference,
      currency: ex.currency,
      raw: { page: t.page, aiDate: t.date, aiAmount: t.amount, aiBalance: t.balanceAfter },
      issues: [...(date ? [] : ["unparsed_date"]), ...(Number.isFinite(t.amount) ? [] : ["unparsed_amount"])],
    };
  });
  const meta: StatementMeta = {
    bank: ex.bank,
    accountHolder: ex.accountHolder,
    accountNumberMasked: ex.accountNumberMasked,
    currency: ex.currency,
    periodStart: parseStatementDate(ex.periodStart ?? "", "YMD"),
    periodEnd: parseStatementDate(ex.periodEnd ?? "", "YMD"),
    // Credit cards: the printed balance is an amount owed; in our sign convention a balance owed is negative.
    openingBalanceMinor: typeof ex.openingBalance === "number" ? toMinor(isCard ? -ex.openingBalance : ex.openingBalance) : null,
    closingBalanceMinor: typeof ex.closingBalance === "number" ? toMinor(isCard ? -ex.closingBalance : ex.closingBalance) : null,
    totalCreditsMinor: typeof ex.totalCredits === "number" ? toMinor(Math.abs(ex.totalCredits)) : null,
    totalDebitsMinor: typeof ex.totalDebits === "number" ? toMinor(Math.abs(ex.totalDebits)) : null,
  };
  return { txns, meta, notes: ex.warnings };
}

const CategorizeSchema = z.object({
  assignments: z.array(
    z.object({
      index: z.number().int(),
      categoryId: z.string().nullable(),
      merchant: z.string(),
      confidence: z.number(),
      isTransfer: z.boolean(),
    }),
  ),
});

export async function aiCategorize(
  ai: AI,
  items: { index: number; description: string; amountMinor: number; currency: string; reference?: string | null }[],
  categories: { id: string; name: string; type: "INCOME" | "EXPENSE" }[],
  businessName: string,
  accountNames: string[],
): Promise<Map<number, { categoryId: string | null; merchant: string; confidence: number; isTransfer: boolean }>> {
  const out = new Map<number, { categoryId: string | null; merchant: string; confidence: number; isTransfer: boolean }>();
  const chunks: typeof items[] = [];
  for (let i = 0; i < items.length; i += 120) chunks.push(items.slice(i, i + 120));
  for (const chunk of chunks) {
    const prompt = `Business: ${businessName} (premium immigration consultancy; income is mostly client fees, consultations and retainers; expenses are staff/contractors, software, marketing, government/visa fees, legal, office, travel).
Our own bank/card accounts: ${accountNames.join(", ") || "n/a"}.

Categories (use the id):
${categories.map((c) => `${c.id} | ${c.type} | ${c.name}`).join("\n")}

For each transaction return: index, categoryId (must be an INCOME category when amount > 0 and an EXPENSE category when amount < 0; null only if truly unknowable), merchant (clean human-readable counterparty name, e.g. "Google Workspace" from "GOOGLE *GSUITE_migrizo"), confidence 0-1 (be honest; 0.95+ only for obvious cases), isTransfer=true when the line is a movement between the business's own accounts, a credit-card bill payment from the bank account, or an owner top-up/withdrawal that is not income/expense (then categoryId may be null).

Transactions (index | amount | currency | description | reference):
${chunk.map((t) => `${t.index} | ${(t.amountMinor / 100).toFixed(2)} | ${t.currency} | ${t.description.replace(/\|/g, "/")} | ${t.reference ?? ""}`).join("\n")}`;
    const r = await run(ai, CategorizeSchema, [{ type: "text", text: prompt }], 16000, "high");
    const validIds = new Set(categories.map((c) => c.id));
    for (const a of r.assignments) out.set(a.index, { categoryId: a.categoryId && validIds.has(a.categoryId) ? a.categoryId : null, merchant: a.merchant, confidence: Math.max(0, Math.min(1, a.confidence)), isTransfer: a.isTransfer });
  }
  return out;
}
