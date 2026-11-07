import { NextResponse } from "next/server";
import { createBatch } from "@/lib/import/batches";
import { triggerProcessing } from "@/lib/import/trigger";

export async function POST(req: Request) {
  try {
    const { path, fileName, accountId } = (await req.json()) as { path: string; fileName: string; accountId: string };
    if (!path || !fileName || !accountId) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    const batch = await createBatch({ fileName, storagePath: path, accountId });
    const runner = await triggerProcessing(batch.id);
    return NextResponse.json({ batchId: batch.id, runner });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
