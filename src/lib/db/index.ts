import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import * as schema from "./schema";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

type Cache = { db?: DB; promise?: Promise<DB> };
const g = globalThis as unknown as { __migrizoDb?: Cache };
const cache: Cache = (g.__migrizoDb ??= {});

export const isSupabase = () => Boolean(process.env.DATABASE_URL);

async function create(): Promise<DB> {
  if (process.env.DATABASE_URL) {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { Pool } = await import("pg");
    // Supabase's session pooler (port 5432) allows only ~15 clients in total, and serverless functions freeze with
    // their connections still open, so it fills up (EMAXCONNSESSION). The transaction pooler (port 6543) on the same
    // host is built for serverless and allows ~200 clients, so a Supabase pooler URL is always pointed at it.
    // The pg driver is used because it sends one query at a time per connection. postgres-js pipelines several
    // queries down one connection, which the transaction pooler can leave unanswered until the function times out.
    const url = process.env.DATABASE_URL.replace(/(\.pooler\.supabase\.com):5432(?=\/|\?|$)/, "$1:6543").replace(/\?.*$/, "");
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    const pool = new Pool({
      connectionString: url,
      ssl: local ? false : { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 10_000,
      maxLifetimeSeconds: 600,
      connectionTimeoutMillis: 10_000,
      // A query that gets no answer (for example on a connection dropped while the function was frozen) fails
      // after 20 seconds instead of holding the page until the platform kills it.
      query_timeout: 20_000,
      keepAlive: true,
    });
    // A pooled connection that dies while idle must not crash the server process.
    pool.on("error", (err) => console.error("[db] idle connection error:", err.message));
    return drizzle({ client: pool, schema }) as unknown as DB;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const path = await import("node:path");
  const fs = await import("node:fs");
  const dir = path.resolve(process.cwd(), process.env.PGLITE_DIR || "data/pglite");
  fs.mkdirSync(dir, { recursive: true });
  // A dev server that was killed can leave a stale lock file behind, which makes PGlite abort on startup.
  fs.rmSync(path.join(dir, "postmaster.pid"), { force: true });
  const client = new PGlite(dir);
  await client.waitReady;
  return drizzle(client, { schema }) as unknown as DB;
}

export async function getDb(): Promise<DB> {
  if (cache.db) return cache.db;
  if (!cache.promise) {
    cache.promise = create().then((db) => {
      cache.db = db;
      return db;
    });
  }
  return cache.promise;
}

export { schema };
