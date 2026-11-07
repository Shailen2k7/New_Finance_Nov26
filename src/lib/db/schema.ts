import {
  pgTable,
  text,
  uuid,
  bigint,
  boolean,
  integer,
  timestamp,
  date,
  jsonb,
  numeric,
  real,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ---------- Enums ----------
export const txnTypeEnum = pgEnum("txn_type", ["INCOME", "EXPENSE", "TRANSFER"]);
export const accountTypeEnum = pgEnum("account_type", ["BANK", "CARD", "CASH", "WALLET", "SAVINGS"]);
export const categoryTypeEnum = pgEnum("category_type", ["INCOME", "EXPENSE"]);
export const loanDirectionEnum = pgEnum("loan_direction", ["BORROWED", "LENT"]);
export const loanStatusEnum = pgEnum("loan_status", ["ACTIVE", "CLOSED"]);
export const frequencyEnum = pgEnum("frequency", ["WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY"]);
export const batchStatusEnum = pgEnum("batch_status", ["UPLOADED", "PROCESSING", "REVIEW", "COMMITTED", "FAILED"]);
export const txnStatusEnum = pgEnum("txn_status", ["CLEARED", "PENDING"]);

// ---------- Settings (single row) ----------
export const settings = pgTable("settings", {
  id: integer("id").primaryKey().default(1),
  businessName: text("business_name").notNull().default("Migrizo"),
  baseCurrency: text("base_currency").notNull().default("USD"),
  fiscalYearStart: integer("fiscal_year_start").notNull().default(1), // 1 = January
  anthropicApiKey: text("anthropic_api_key"),
  aiModel: text("ai_model").notNull().default("claude-opus-5-5"),
  sharedPassword: text("shared_password").notNull().default("migrizo"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Accounts ----------
export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  institution: text("institution"),
  type: accountTypeEnum("type").notNull().default("BANK"),
  currency: text("currency").notNull().default("USD"),
  lastFour: text("last_four"),
  openingBalanceMinor: bigint("opening_balance_minor", { mode: "number" }).notNull().default(0),
  openingBalanceDate: date("opening_balance_date"),
  color: text("color").notNull().default("#2563eb"),
  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Categories ----------
export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    type: categoryTypeEnum("type").notNull(),
    color: text("color").notNull().default("#64748b"),
    icon: text("icon").notNull().default("tag"),
    isSystem: boolean("is_system").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("categories_name_type_idx").on(t.name, t.type)],
);

// ---------- Transactions ----------
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    description: text("description").notNull(),
    merchant: text("merchant"),
    // Signed amount in minor units (cents). Positive = money in, negative = money out.
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    // Same amount converted to the business base currency at fxRate
    baseAmountMinor: bigint("base_amount_minor", { mode: "number" }).notNull(),
    fxRate: numeric("fx_rate", { precision: 18, scale: 8 }).notNull().default("1"),
    type: txnTypeEnum("type").notNull(),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    notes: text("notes"),
    reference: text("reference"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    fingerprint: text("fingerprint").notNull(),
    importBatchId: uuid("import_batch_id"),
    recurringId: uuid("recurring_id"),
    loanId: uuid("loan_id"),
    status: txnStatusEnum("status").notNull().default("CLEARED"),
    isReviewed: boolean("is_reviewed").notNull().default(true),
    confidence: real("confidence"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("transactions_fingerprint_idx").on(t.fingerprint),
    index("transactions_date_idx").on(t.date),
    index("transactions_account_idx").on(t.accountId),
    index("transactions_category_idx").on(t.categoryId),
  ],
);

// ---------- Category rules (learned merchant -> category memory) ----------
export const categoryRules = pgTable(
  "category_rules",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    pattern: text("pattern").notNull(), // normalized merchant/description key
    merchantLabel: text("merchant_label"),
    categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
    source: text("source").notNull().default("USER"), // USER | AI
    hits: integer("hits").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("category_rules_pattern_idx").on(t.pattern)],
);

// ---------- Loans ----------
export const loans = pgTable("loans", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  counterparty: text("counterparty"), // lender or borrower
  direction: loanDirectionEnum("direction").notNull().default("BORROWED"),
  principalMinor: bigint("principal_minor", { mode: "number" }).notNull(),
  currency: text("currency").notNull(),
  interestRateApr: numeric("interest_rate_apr", { precision: 8, scale: 4 }).notNull().default("0"),
  startDate: date("start_date").notNull(),
  termMonths: integer("term_months"),
  paymentAmountMinor: bigint("payment_amount_minor", { mode: "number" }),
  paymentDay: integer("payment_day"),
  status: loanStatusEnum("status").notNull().default("ACTIVE"),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const loanPayments = pgTable("loan_payments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  loanId: uuid("loan_id").notNull().references(() => loans.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
  principalMinor: bigint("principal_minor", { mode: "number" }).notNull(),
  interestMinor: bigint("interest_minor", { mode: "number" }).notNull().default(0),
  transactionId: uuid("transaction_id"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Recurring payments ----------
export const recurringPayments = pgTable("recurring_payments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  merchantPattern: text("merchant_pattern"),
  amountMinor: bigint("amount_minor", { mode: "number" }).notNull(), // signed
  currency: text("currency").notNull(),
  type: txnTypeEnum("type").notNull().default("EXPENSE"),
  frequency: frequencyEnum("frequency").notNull().default("MONTHLY"),
  nextDueDate: date("next_due_date").notNull(),
  endDate: date("end_date"),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
  isActive: boolean("is_active").notNull().default(true),
  autoDetected: boolean("auto_detected").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Statement imports ----------
export const importBatches = pgTable("import_batches", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(), // csv | xlsx | pdf | image
  storagePath: text("storage_path").notNull(),
  accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  status: batchStatusEnum("status").notNull().default("UPLOADED"),
  stage: text("stage").notNull().default("Queued"),
  progress: integer("progress").notNull().default(0),
  error: text("error"),
  engine: text("engine"), // ai | heuristic
  detected: jsonb("detected").$type<DetectedStatement>(),
  stats: jsonb("stats").$type<BatchStats>(),
  reconciliation: jsonb("reconciliation").$type<Reconciliation>(),
  mapping: jsonb("mapping").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  committedAt: timestamp("committed_at", { withTimezone: true }),
});

export const importRows = pgTable(
  "import_rows",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    batchId: uuid("batch_id").notNull().references(() => importBatches.id, { onDelete: "cascade" }),
    rowIndex: integer("row_index").notNull(),
    date: date("date"),
    description: text("description").notNull().default(""),
    merchant: text("merchant"),
    amountMinor: bigint("amount_minor", { mode: "number" }),
    currency: text("currency").notNull(),
    balanceAfterMinor: bigint("balance_after_minor", { mode: "number" }),
    reference: text("reference"),
    type: txnTypeEnum("type").notNull().default("EXPENSE"),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    confidence: real("confidence").notNull().default(0),
    flags: text("flags").array().notNull().default(sql`'{}'::text[]`),
    isDuplicate: boolean("is_duplicate").notNull().default(false),
    include: boolean("include").notNull().default(true),
    raw: jsonb("raw").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("import_rows_batch_idx").on(t.batchId)],
);

// ---------- FX rates cache ----------
export const fxRates = pgTable(
  "fx_rates",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    base: text("base").notNull(),
    quote: text("quote").notNull(),
    rate: numeric("rate", { precision: 18, scale: 8 }).notNull(),
    date: date("date").notNull(),
    source: text("source").notNull().default("frankfurter"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("fx_rates_pair_date_idx").on(t.base, t.quote, t.date)],
);

// ---------- Audit log ----------
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    actor: text("actor").notNull(),
    action: text("action").notNull(), // e.g. transaction.create
    entity: text("entity").notNull(), // e.g. transaction
    entityId: text("entity_id"),
    summary: text("summary").notNull(),
    before: jsonb("before").$type<Record<string, unknown> | null>(),
    after: jsonb("after").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt), index("audit_logs_entity_idx").on(t.entity)],
);

// ---------- Relations ----------
export const accountsRelations = relations(accounts, ({ many }) => ({
  transactions: many(transactions),
}));
export const categoriesRelations = relations(categories, ({ many }) => ({
  transactions: many(transactions),
}));
export const transactionsRelations = relations(transactions, ({ one }) => ({
  account: one(accounts, { fields: [transactions.accountId], references: [accounts.id] }),
  category: one(categories, { fields: [transactions.categoryId], references: [categories.id] }),
}));
export const loansRelations = relations(loans, ({ many, one }) => ({
  payments: many(loanPayments),
  account: one(accounts, { fields: [loans.accountId], references: [accounts.id] }),
}));
export const loanPaymentsRelations = relations(loanPayments, ({ one }) => ({
  loan: one(loans, { fields: [loanPayments.loanId], references: [loans.id] }),
}));
export const recurringRelations = relations(recurringPayments, ({ one }) => ({
  category: one(categories, { fields: [recurringPayments.categoryId], references: [categories.id] }),
  account: one(accounts, { fields: [recurringPayments.accountId], references: [accounts.id] }),
}));
export const importBatchesRelations = relations(importBatches, ({ many, one }) => ({
  rows: many(importRows),
  account: one(accounts, { fields: [importBatches.accountId], references: [accounts.id] }),
}));
export const importRowsRelations = relations(importRows, ({ one }) => ({
  batch: one(importBatches, { fields: [importRows.batchId], references: [importBatches.id] }),
  category: one(categories, { fields: [importRows.categoryId], references: [categories.id] }),
}));

// ---------- JSON types ----------
export type DetectedStatement = {
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

export type BatchStats = {
  rows: number;
  included: number;
  duplicates: number;
  flagged: number;
  creditsMinor: number;
  debitsMinor: number;
  categorized: number;
};

export type ReconciliationCheck = { name: string; ok: boolean; detail: string };
export type Reconciliation = {
  ok: boolean;
  checks: ReconciliationCheck[];
  computedClosingMinor?: number | null;
  diffMinor?: number | null;
};

export type Account = typeof accounts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Loan = typeof loans.$inferSelect;
export type LoanPayment = typeof loanPayments.$inferSelect;
export type RecurringPayment = typeof recurringPayments.$inferSelect;
export type ImportBatch = typeof importBatches.$inferSelect;
export type ImportRow = typeof importRows.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type CategoryRule = typeof categoryRules.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
