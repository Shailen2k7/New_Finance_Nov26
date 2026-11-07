import { NextResponse } from "next/server";
import { hasSupabaseStorage, createSignedUpload } from "@/lib/storage";
import { safeStoragePath } from "@/lib/import/batches";
import { fileTypeFor } from "@/lib/import/pipeline";

export async function POST(req: Request) {
  const { fileName } = (await req.json()) as { fileName: string };
  if (!fileName || !fileTypeFor(fileName)) return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  if (!hasSupabaseStorage()) return NextResponse.json({ direct: false });
  const path = safeStoragePath(fileName);
  const signed = await createSignedUpload(path);
  return NextResponse.json({ direct: true, path: signed.path, token: signed.token, bucket: signed.bucket });
}
