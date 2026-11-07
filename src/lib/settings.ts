import { getDb, schema } from "./db";
import { cache } from "react";

export const getSettings = cache(async () => {
  const db = await getDb();
  let rows = await db.select().from(schema.settings).limit(1);
  if (rows.length === 0) {
    await db.insert(schema.settings).values({ id: 1 }).onConflictDoNothing();
    rows = await db.select().from(schema.settings).limit(1);
  }
  return rows[0];
});

export async function getAnthropicKey(): Promise<string | null> {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const s = await getSettings();
  return s.anthropicApiKey || null;
}
