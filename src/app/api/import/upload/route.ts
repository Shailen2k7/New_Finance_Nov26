import { NextResponse } from "next/server";
import { putFile } from "@/lib/storage";
import { createBatch, safeStoragePath } from "@/lib/import/batches";
import { triggerProcessing } from "@/lib/import/trigger";

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const accountId = String(form.get("accountId") ?? "");
    if (!(file instanceof File) || !accountId) return NextResponse.json({ error: "Missing file or account" }, { status: 400 });
    if (file.size > 40 * 1024 * 1024) return NextResponse.json({ error: "File larger than 40 MB" }, { status: 400 });
    const path = safeStoragePath(file.name);
    await putFile(path, Buffer.from(await file.arrayBuffer()), file.type || "application/octet-stream");
    const batch = await createBatch({ fileName: file.name, storagePath: path, accountId });
    const runner = await triggerProcessing(batch.id);
    return NextResponse.json({ batchId: batch.id, runner });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
