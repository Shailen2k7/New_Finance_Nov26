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
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const postgres = (await import("postgres")).default;
    // Supabase's session pooler (port 5432) allows only ~15 clients in total. Serverless functions freeze with their
    // connections still open, so a few instances fill it and every page fails with EMAXCONNSESSION.
    // The transaction pooler (port 6543) on the same host is built for serverless and allows ~200 clients,
    // so a Supabase pooler URL is always pointed at it. It requires prepare: false.
    // postgres-js would send pgbouncer=true to the server as a setting, so it is removed from the URL here.
    const url = process.env.DATABASE_URL.replace(/[?&]pgbouncer=true/, "").replace(
      /(\.pooler\.supabase\.com):5432(?=\/|\?|$)/,
      "$1:6543",
    );
    const client = postgres(url, {
      prepare: false,
      max: 3,
      idle_timeout: 20,
      max_lifetime: 60 * 10,
      connect_timeout: 10,
      ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(url) ? false : "require",
    });
    return drizzle(client, { schema }) as unknown as DB;
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
