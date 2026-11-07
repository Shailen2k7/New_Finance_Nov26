import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "../db";
import { fileTypeFor } from "./pipeline";

export async function createBatch(input: { fileName: string; storagePath: string; accountId: string }) {
  const fileType = fileTypeFor(input.fileName);
  if (!fileType) throw new Error("Unsupported file type. Upload a PDF, CSV, Excel or image statement.");
  const db = await getDb();
  const [row] = await db.insert(schema.importBatches).values({ fileName: input.fileName, fileType, storagePath: input.storagePath, accountId: input.accountId, status: "UPLOADED", stage: "Queued", progress: 0 }).returning();
  return row;
}

export async function listBatches(limit = 50) {
  const db = await getDb();
  return db.query.importBatches.findMany({ with: { account: true }, orderBy: desc(schema.importBatches.createdAt), limit });
}

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export async function getBatch(id: string) {
  if (!isUuid(id)) return undefined;
  const db = await getDb();
  return db.query.importBatches.findFirst({ where: eq(schema.importBatches.id, id), with: { account: true } });
}

export async function getBatchRows(id: string) {
  if (!isUuid(id)) return [];
  const db = await getDb();
  return db.query.importRows.findMany({ where: eq(schema.importRows.batchId, id), orderBy: (r, { asc }) => [asc(r.rowIndex)] });
}

export function safeStoragePath(fileName: string) {
  const clean = fileName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${stamp}-${Math.random().toString(36).slice(2, 8)}/${clean}`;
}
