import { NextResponse } from "next/server";
import { runImportPipeline } from "@/lib/import/pipeline";

export const maxDuration = 300;

/** Inline worker endpoint (used when a background function is not available). Protected by IMPORT_WORKER_SECRET. */
export async function POST(req: Request) {
  const secret = process.env.IMPORT_WORKER_SECRET;
  if ((secret || process.env.DATABASE_URL) && req.headers.get("x-worker-secret") !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { batchId } = (await req.json()) as { batchId: string };
  await runImportPipeline(batchId);
  return NextResponse.json({ ok: true });
}
