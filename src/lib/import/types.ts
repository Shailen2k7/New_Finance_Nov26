export type ParsedTxn = {
  rowIndex: number;
  date: string | null; // ISO
  description: string;
  merchant?: string | null;
  amountMinor: number | null; // signed
  balanceAfterMinor?: number | null;
  reference?: string | null;
  currency?: string | null;
  raw: Record<string, unknown>;
  issues: string[]; // e.g. "unparsed_date", "unparsed_amount"
};

export type ColumnMapping = {
  headerRowIndex: number; // -1 if no header
  dataStartRow: number;
  dateCol: number;
  descriptionCols: number[]; // concatenated with " "
  amountMode: "single_signed" | "debit_credit" | "amount_with_type";
  amountCol?: number | null;
  debitCol?: number | null;
  creditCol?: number | null;
  typeCol?: number | null;
  typeDebitValues?: string[]; // values in typeCol that mean money out
  balanceCol?: number | null;
  referenceCol?: number | null;
  currencyCol?: number | null;
  dateOrder: "DMY" | "MDY" | "YMD";
  /** For single_signed: whether negative means money OUT (true, normal) or money IN (false, e.g. credit card statements) */
  negativeIsOut: boolean;
  /** When debit column values are positive numbers that should be treated as money out */
  skipRowPatterns?: string[]; // regex (case-insensitive) matched against the joined row text; e.g. "^Opening balance"
  notes?: string;
};

export type StatementMeta = {
  bank?: string | null;
  accountHolder?: string | null;
  accountNumberMasked?: string | null;
  currency?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  openingBalanceMinor?: number | null;
  closingBalanceMinor?: number | null;
  totalCreditsMinor?: number | null;
  totalDebitsMinor?: number | null;
};

export type ParseResult = {
  engine: "ai" | "heuristic";
  txns: ParsedTxn[];
  meta: StatementMeta;
  mapping?: ColumnMapping | null;
  textForVerification?: string | null; // extracted PDF text
  notes: string[];
};
