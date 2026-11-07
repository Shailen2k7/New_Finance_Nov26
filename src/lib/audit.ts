import { getDb, schema } from "./db";
import { getSession } from "./auth";

export type AuditEntry = { action: string; entity: string; entityId?: string | null; summary: string; before?: unknown; after?: unknown };

function compact(v: unknown): Record<string, unknown> | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "object") return { value: v };
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (val === undefined) continue;
    if (val instanceof Date) out[k] = val.toISOString();
    else if (typeof val === "object" && val !== null && !Array.isArray(val)) continue; // skip nested relation objects
    else out[k] = val;
  }
  return out;
}

/** Records who changed what. Never throws — auditing must not break the action it describes. */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const session = await getSession();
    const db = await getDb();
    await db.insert(schema.auditLogs).values({
      actor: session?.name ?? "system",
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      summary: entry.summary,
      before: compact(entry.before),
      after: compact(entry.after),
    });
  } catch (e) {
    console.error("audit log failed", e);
  }
}

/** Keys whose values differ between two snapshots. */
export function changedKeys(before: Record<string, unknown> | null | undefined, after: Record<string, unknown> | null | undefined): string[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...keys].filter((k) => JSON.stringify(before?.[k] ?? null) !== JSON.stringify(after?.[k] ?? null));
}
