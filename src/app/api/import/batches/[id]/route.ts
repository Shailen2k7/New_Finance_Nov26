import { NextResponse } from "next/server";
import { getBatch } from "@/lib/import/batches";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = await getBatch(id);
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ id: b.id, status: b.status, stage: b.stage, progress: b.progress, error: b.error, stats: b.stats, reconciliation: b.reconciliation, engine: b.engine, fileName: b.fileName });
}
