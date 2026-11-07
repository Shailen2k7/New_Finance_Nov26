import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { triggerProcessing } from "@/lib/import/trigger";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = await getDb();
  const b = await db.query.importBatches.findFirst({ where: eq(schema.importBatches.id, id) });
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (b.status === "COMMITTED") return NextResponse.json({ error: "Already committed" }, { status: 400 });
  await db.update(schema.importBatches).set({ status: "UPLOADED", stage: "Queued", progress: 0, error: null }).where(eq(schema.importBatches.id, id));
  const runner = await triggerProcessing(id);
  return NextResponse.json({ ok: true, runner });
}
