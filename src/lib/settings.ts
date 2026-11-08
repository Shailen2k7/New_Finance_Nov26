import { getDb, schema } from "./db";
import { cache } from "react";

type SettingsRow = typeof schema.settings.$inferSelect;

/** Settings change rarely, so each server instance keeps them for a minute instead of asking the database on every click. */
const TTL_MS = 60_000;
const store = globalThis as unknown as { __migrizoSettings?: { at: number; value: SettingsRow } };

/** Call after saving settings so this server instance shows the change straight away. */
export function invalidateSettings() {
  store.__migrizoSettings = undefined;
}

export const getSettings = cache(async (): Promise<SettingsRow> => {
  const hit = store.__migrizoSettings;
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const db = await getDb();
  let rows = await db.select().from(schema.settings).limit(1);
  if (rows.length === 0) {
    await db.insert(schema.settings).values({ id: 1 }).onConflictDoNothing();
    rows = await db.select().from(schema.settings).limit(1);
  }
  store.__migrizoSettings = { at: Date.now(), value: rows[0] };
  return rows[0];
});

export async function getAnthropicKey(): Promise<string | null> {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const s = await getSettings();
  return s.anthropicApiKey || null;
}
