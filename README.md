# Migrizo Finance

A finance management portal for Migrizo: income, expenses, loans, recurring payments, multi‑currency reporting and an AI statement importer that reads bank/card statements (PDF, CSV, Excel, images), verifies them against the statement balances and queues them for review before anything is written to the ledger.

- **Stack:** Next.js 15 (App Router) · TypeScript · Tailwind 4 · Drizzle ORM · Postgres (Supabase) · Supabase Storage · shared-password login with named users + full audit log · Anthropic Claude (statement parsing & categorization) · Netlify (hosting + background function)
- **Local mode:** zero configuration. Without Supabase variables the app uses an embedded Postgres (PGlite) in `./data` and local file uploads. Sign in with any name and the shared password (default `migrizo`).

## 1. Run locally

```bash
npm install
npm run setup      # creates the schema and seeds categories + a default account
npm run dev        # http://localhost:3000
```

Optional: put `ANTHROPIC_API_KEY=...` in `.env` (or paste the key in **Settings → AI statement parsing**) to enable AI parsing of PDF and image statements. CSV/Excel imports work without a key using deterministic column detection.

## 2. Supabase setup (database, storage, auth)

1. Create a project at https://supabase.com. Note the **Project URL**, **anon key** and **service_role key** (Project Settings → API).
2. Database connection strings (Project Settings → Database → Connection string):
   - `DATABASE_URL` = **Transaction pooler** URI (port `6543`).
   - `DIRECT_URL` = **Session pooler** URI (port `5432`) — used only for schema pushes.
3. Paste the details into `.env.supabase` (never commit or share this file).
4. Stop the local portal, then move everything across:
   ```bash
   npm run go-live:check
   npm run go-live:move
   ```
   This creates the tables, turns on row-level security and removes public access, copies every row in one transaction, verifies each table against the local copy, and uploads the statement files to a private bucket. Never run `db:seed` on the live database, and do not re-import statements to move data: that loses manual category edits.
5. After any future schema change, run `db:push` and then confirm new tables have row-level security enabled. The public key is visible in the browser, so an unlocked table is readable by anyone.

## 3. Netlify deployment

1. Push this repository to GitHub and import it in Netlify (**Add new site → Import an existing project**). The build command `npm run build` and the Next.js runtime are configured in `netlify.toml`.
2. Site configuration → **Environment variables** — add:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | Supabase transaction pooler URI (port 6543) |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key (used for direct statement uploads to Storage) |
   | `APP_PASSWORD` | the shared team password (required: login is refused without it) |
   | `SESSION_SECRET` | long random string that signs login sessions (required: the site will not run without it) |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key (server only) |
   | `ANTHROPIC_API_KEY` | your Anthropic key (or set it later in Settings) |
   | `IMPORT_WORKER_SECRET` | long random string (required: statement parsing is refused without it) |
   | `NODE_VERSION` | `22` |

3. Deploy. Sign in at `https://<your-site>.netlify.app/login` with your name and the shared password.

### How statement parsing runs in production

Reading a PDF with Claude can take 30–90 seconds, longer than Netlify's synchronous function limit, so parsing runs in the **Netlify background function** `netlify/functions/parse-statement-background.mts` (15‑minute limit). The app calls it after the upload and the UI polls for progress. Background functions require a Netlify plan that includes them (Pro or higher at the time of writing); on a plan without them set `IMPORT_RUNNER=inline` — CSV/Excel imports still complete within the synchronous limit, and PDF/image imports may time out.

Uploads go straight from the browser to Supabase Storage via a signed URL, so Netlify's request body limit never applies.

## 4. How accuracy is enforced in the importer

1. **Numbers never pass through the model for CSV/Excel.** The AI only decides the column mapping; amounts and dates are converted deterministically from the file.
2. **PDF/image statements** are read in full by Claude with a strict JSON schema, then verified: *opening balance + all transactions = closing balance*, *running balances chain row by row*, *credit/debit totals match the statement summary*, *every amount appears verbatim in the PDF text layer*, *dates fall within the statement period*. If a check fails, the model is asked to re‑read the document with the discrepancy spelled out (up to two passes).
3. **Nothing is written until you commit.** The review screen shows every check, flags questionable rows, lets you edit any cell, and blocks commit while a row has a missing date or amount.
4. **Duplicates are impossible.** Each transaction carries a fingerprint (account + date + amount + description + occurrence); re‑importing a statement marks everything as already imported.
5. **Categorization learns.** Every category you confirm becomes a rule applied to future imports before the AI is consulted; recurring payments are matched by merchant pattern; internal transfers are kept out of income/expenses.

## 6. Project map

```
src/app/(portal)/            pages: dashboard, transactions, income, expenses, import, recurring, loans, reports, accounts, categories, settings
src/app/api/import/*         upload / sign / start / status / retry routes
src/lib/db/schema.ts         Drizzle schema (Postgres)
src/lib/import/              pipeline.ts (orchestration), mapping.ts (deterministic CSV/Excel), ai.ts (Claude calls), reconcile.ts (checks)
src/lib/actions/*            server actions (transactions, loans, recurring, accounts, categories, settings, import review/commit)
netlify/functions/           background worker
```

Useful scripts: `npm run db:push` (apply schema), `npm run db:seed`, `npm run db:studio` (Drizzle Studio), `npm run typecheck`.
