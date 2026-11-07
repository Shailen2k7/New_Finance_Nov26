/**
 * Moves the local portal to Supabase without losing anything.
 *
 *   npm run go-live:check   Read-only. Confirms the details in .env.supabase work.
 *   npm run go-live:move    Creates the tables, locks them, copies every row and statement file, verifies.
 *   npm run go-live:files   Retries only the statement files, if that step failed during a move.
 *
 * Stop the dev server before `move`: the local database allows one process at a time.
 * The move refuses to run on a database that already holds data, and the row copy is one transaction:
 * it commits only if every table matches the local copy exactly, otherwise nothing is kept.
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";
import { PGlite } from "@electric-sql/pglite";

const ENV_FILE = process.env.GO_LIVE_ENV_FILE || ".env.supabase";
const SOURCE_DIR = process.env.GO_LIVE_SOURCE || "data/pglite";
const UPLOADS_DIR = "data/uploads";
const BUCKET = "statements";

// Parents before children, so foreign keys hold while copying.
const TABLES = [
  "settings", "accounts", "categories", "category_rules", "loans", "loan_payments", "recurring_payments",
  "import_batches", "import_rows", "transactions", "fx_rates", "audit_logs",
];

const FINGERPRINT = (t: string) =>
  `SELECT count(*)::int AS n, coalesce(md5(string_agg(x, '|' ORDER BY x COLLATE "C")), '') AS h
   FROM (SELECT to_jsonb(r)::text AS x FROM public."${t}" r) s`;
const COLUMNS = `SELECT table_name, column_name, data_type FROM information_schema.columns
                 WHERE table_schema = 'public' ORDER BY table_name, column_name`;

const say = (s: string) => console.log(s);
const ok = (s: string) => console.log(`  OK   ${s}`);
function stop(message: string): never {
  console.error(`\nSTOPPED: ${message}\nNothing further was done.`);
  process.exit(1);
}

function loadEnv(): Record<string, string> {
  if (!fs.existsSync(ENV_FILE)) stop(`${ENV_FILE} was not found.`);
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const isLocal = (url: string) => /@(localhost|127\.0\.0\.1)[:/]/.test(url);

function connect(url: string) {
  return postgres(url.replace(/[?&]pgbouncer=true/, ""), {
    prepare: false,
    max: 1,
    ssl: isLocal(url) ? false : "require",
    onnotice: () => {},
    connection: { TimeZone: "UTC" },
  });
}

function needs(env: Record<string, string>, keys: string[]) {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length) stop(`These are still empty in ${ENV_FILE}: ${missing.join(", ")}`);
}

function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/password authentication failed/i.test(msg)) return "Supabase rejected the database password in DIRECT_URL.";
  if (/ENOTFOUND|getaddrinfo/i.test(msg)) return "That database address was not found. Use the Session pooler string from Supabase.";
  if (/Invalid URL|ERR_INVALID_URL/i.test(msg)) return "DIRECT_URL is not valid. If the password has symbols such as @ or #, reset it to letters and numbers only.";
  return msg;
}

// Plain HTTP on purpose: supabase-js needs a WebSocket that Node 20 does not have.
function storage(env: Record<string, string>) {
  const base = `${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/storage/v1`;
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
  const object = (p: string) => `${base}/object/${BUCKET}/${p.split("/").map(encodeURIComponent).join("/")}`;
  return {
    listBuckets: () => fetch(`${base}/bucket`, { headers }),
    getBucket: () => fetch(`${base}/bucket/${BUCKET}`, { headers }),
    createBucket: () =>
      fetch(`${base}/bucket`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: 52428800 }),
      }),
    upload: (p: string, bytes: Buffer) =>
      fetch(object(p), {
        method: "POST",
        headers: { ...headers, "content-type": p.endsWith(".pdf") ? "application/pdf" : "application/octet-stream", "x-upsert": "true" },
        body: new Uint8Array(bytes),
      }),
    download: (p: string) => fetch(object(p), { headers }),
  };
}

async function copyFiles(env: Record<string, string>, sql: postgres.Sql) {
  const st = storage(env);
  const found = await st.getBucket();
  if (found.ok) {
    const bucket = (await found.json()) as { public?: boolean };
    if (bucket.public) stop("The statements folder on Supabase is public. Make it private first.");
  } else {
    const made = await st.createBucket();
    if (!made.ok) stop(`Could not create the private statements folder: ${await made.text()}`);
  }
  const sha = (x: Buffer) => crypto.createHash("sha256").update(x).digest("hex");
  const files = await sql<{ storage_path: string }[]>`SELECT DISTINCT storage_path FROM import_batches`;
  for (const { storage_path } of files) {
    const full = path.resolve(UPLOADS_DIR, storage_path);
    if (!fs.existsSync(full)) { say(`  SKIP ${storage_path}: no local file`); continue; }
    const bytes = fs.readFileSync(full);
    const sent = await st.upload(storage_path, bytes);
    if (!sent.ok) stop(`The rows are safely on Supabase, but a statement file failed. Fix this, then run npm run go-live:files. ${await sent.text()}`);
    const back = Buffer.from(await (await st.download(storage_path)).arrayBuffer());
    if (sha(back) !== sha(bytes)) stop(`A statement file did not match after upload: ${storage_path}`);
    ok(`${path.basename(storage_path)} uploaded and identical`);
  }
}

async function proof(env: Record<string, string>, sql: postgres.Sql) {
  say(`  OK   ${await publicProbe(env)}`);
  const accounts = await sql`
    SELECT a.name, (a.opening_balance_minor + coalesce(sum(t.amount_minor), 0))::text AS minor, count(t.id)::int AS n
    FROM accounts a LEFT JOIN transactions t ON t.account_id = a.id GROUP BY a.id`;
  for (const a of accounts) ok(`${a.name}: balance ${(Number(a.minor) / 100).toFixed(2)}, ${a.n} transactions`);
}

async function targetCounts(sql: postgres.Sql) {
  const present = await sql<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  const counts: Record<string, number> = {};
  for (const { tablename } of present) {
    const [r] = await sql.unsafe(`SELECT count(*)::int AS n FROM public."${tablename}"`);
    counts[tablename] = r.n as number;
  }
  return counts;
}

async function lock(sql: postgres.Sql) {
  const tables = await sql<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  for (const { tablename } of tables) await sql.unsafe(`ALTER TABLE public."${tablename}" ENABLE ROW LEVEL SECURITY`);
  const roles = (await sql<{ rolname: string }[]>`SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')`).map((r) => r.rolname);
  if (roles.length) {
    const who = roles.join(", ");
    await sql.unsafe(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${who}`);
    await sql.unsafe(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${who}`);
    await sql.unsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM ${who}`);
    await sql.unsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM ${who}`);
  }
  const open = await sql<{ relname: string }[]>`
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`;
  if (open.length) throw new Error(`Row security is off on: ${open.map((r) => r.relname).join(", ")}`);
  for (const role of roles) {
    const readable = await sql.unsafe(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND has_table_privilege('${role}', c.oid, 'SELECT')`,
    );
    if (readable.length) throw new Error(`${role} can still read: ${readable.map((r) => r.relname).join(", ")}`);
  }
  return { tables: tables.length, roles };
}

async function publicProbe(env: Record<string, string>) {
  if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !env.NEXT_PUBLIC_SUPABASE_URL) return "skipped, public key not provided";
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/transactions?select=id&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  const body = await res.text();
  if (res.ok && body.trim() !== "[]") throw new Error("The public key can read transactions. The database is NOT locked.");
  return `public key refused, status ${res.status}`;
}

async function check() {
  const env = loadEnv();
  say(`Checking ${ENV_FILE}\n`);
  for (const k of ["DIRECT_URL", "DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "APP_PASSWORD"]) {
    say(`  ${env[k] ? "OK  " : "EMPTY"} ${k}`);
  }
  needs(env, ["DIRECT_URL"]);
  const sql = connect(env.DIRECT_URL);
  try {
    const [v] = await sql`SELECT current_setting('server_version') AS v`;
    say("");
    ok(`Connected to the database, Postgres ${v.v}`);
    const counts = await targetCounts(sql);
    const rows = Object.values(counts).reduce((a, b) => a + b, 0);
    ok(Object.keys(counts).length ? `${Object.keys(counts).length} tables, ${rows} rows` : "Database is empty, ready for the move");
  } catch (e) {
    stop(friendly(e));
  } finally {
    await sql.end();
  }
  if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const res = await storage(env).listBuckets();
    if (!res.ok) stop(`Storage refused the secret key: ${await res.text()}`);
    ok("Storage key works");
  }
}

function portInUse(port: number) {
  return new Promise<boolean>((resolve) => {
    const s = net.connect({ host: "127.0.0.1", port });
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("error", () => resolve(false));
  });
}

async function move() {
  const env = loadEnv();
  needs(env, ["DIRECT_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  if (!process.env.GO_LIVE_SOURCE && (await portInUse(3000))) stop("The local portal is still running on port 3000. Stop it first.");

  say("1. Checking the Supabase database");
  const sql = connect(env.DIRECT_URL);
  try {
    const counts = await targetCounts(sql);
    const full = Object.entries(counts).filter(([, n]) => n > 0);
    if (full.length) stop(`Supabase already holds data (${full.map(([t, n]) => `${t}: ${n}`).join(", ")}). The move only runs on an empty database.`);
  } catch (e) {
    stop(friendly(e));
  }
  ok("Connected and empty");

  say("2. Opening a private copy of the local data");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "migrizo-move-"));
  process.on("exit", () => fs.rmSync(tmp, { recursive: true, force: true })); // never leave a copy of the books behind
  fs.cpSync(SOURCE_DIR, tmp, { recursive: true });
  fs.rmSync(path.join(tmp, "postmaster.pid"), { force: true });
  const local = new PGlite(tmp);
  await local.waitReady;
  await local.exec(`SET TIME ZONE 'UTC'`);
  const localTables = (await local.query<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)).rows.map((r) => r.tablename);
  const unknown = localTables.filter((t) => !TABLES.includes(t));
  if (unknown.length) stop(`Local tables this tool does not know: ${unknown.join(", ")}`);
  ok(`${localTables.length} tables found`);

  say("3. Creating the tables on Supabase");
  const directUrl = isLocal(env.DIRECT_URL) || /sslmode=/.test(env.DIRECT_URL) ? env.DIRECT_URL : `${env.DIRECT_URL}${env.DIRECT_URL.includes("?") ? "&" : "?"}sslmode=require`;
  const push = spawnSync("npx", ["drizzle-kit", "push", "--force"], { env: { ...process.env, DIRECT_URL: directUrl, DATABASE_URL: "" }, encoding: "utf8" });
  if (push.status !== 0) stop(`Could not create the tables.\n${(push.stderr || push.stdout || "").replaceAll(env.DIRECT_URL, "<DIRECT_URL>").slice(-800)}`);
  const a = (await local.query<{ table_name: string; column_name: string; data_type: string }>(COLUMNS)).rows;
  const b = await sql.unsafe(COLUMNS);
  const line = (r: { table_name: string; column_name: string; data_type: string }) => `${r.table_name}.${r.column_name}:${r.data_type}`;
  const remote = new Set(b.map((r) => line(r as never)));
  const diff = a.map(line).filter((l) => !remote.has(l));
  if (diff.length || a.length !== b.length) stop(`Table layouts differ between local and Supabase: ${diff.slice(0, 5).join(", ")}`);
  ok(`Tables created, ${a.length} columns match`);

  say("4. Locking the tables before any data arrives");
  const locked = await lock(sql);
  ok(`Row security on for ${locked.tables} tables, public access removed for: ${locked.roles.join(", ") || "no public roles on this server"}`);

  say("5. Copying and verifying every row");
  const report: { table: string; rows: number }[] = [];
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL TIME ZONE 'UTC'`);
      for (const t of TABLES) {
        const { rows } = await local.query<{ j: string }>(`SELECT coalesce(json_agg(r), '[]')::text AS j FROM public."${t}" r`);
        await tx.unsafe(`INSERT INTO public."${t}" SELECT * FROM jsonb_populate_recordset(NULL::public."${t}", $1::text::jsonb)`, [rows[0].j]);
        const src = (await local.query<{ n: number; h: string }>(FINGERPRINT(t))).rows[0];
        const [dst] = await tx.unsafe(FINGERPRINT(t));
        if (src.n !== dst.n || src.h !== dst.h) throw new Error(`${t} does not match after copying (local ${src.n} rows, Supabase ${dst.n} rows)`);
        report.push({ table: t, rows: src.n });
      }
    });
  } catch (e) {
    stop(`The copy was cancelled and Supabase has no rows. ${friendly(e)}`);
  }
  for (const r of report) ok(`${r.table}: ${r.rows} rows identical`);

  say("6. Copying statement files");
  await copyFiles(env, sql);

  say("7. Final proof");
  await proof(env, sql);

  await local.close();
  await sql.end();
  say("\nDone. Your local portal was not changed.");
}

async function filesOnly() {
  const env = loadEnv();
  needs(env, ["DIRECT_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  const sql = connect(env.DIRECT_URL);
  await copyFiles(env, sql);
  await proof(env, sql);
  await sql.end();
}

const cmd = process.argv[2];
(cmd === "check" ? check() : cmd === "move" ? move() : cmd === "files" ? filesOnly() : Promise.resolve(stop("Use: check, move or files")))
  .then(() => process.exit(0))
  .catch((e) => stop(friendly(e)));
