import fs from "node:fs/promises";
import path from "node:path";

const BUCKET = "statements";

export const hasSupabaseStorage = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

async function serviceClient() {
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

export async function ensureBucket() {
  if (!hasSupabaseStorage()) return;
  const sb = await serviceClient();
  const { data } = await sb.storage.getBucket(BUCKET);
  if (!data) await sb.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 52428800 });
}

/** Signed upload URL (Supabase) so the browser uploads directly, bypassing function body limits. */
export async function createSignedUpload(storagePath: string) {
  const sb = await serviceClient();
  await ensureBucket();
  const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(storagePath);
  if (error) throw error;
  return { token: data.token, path: data.path, bucket: BUCKET };
}

export async function putFile(storagePath: string, bytes: Buffer, contentType: string) {
  if (hasSupabaseStorage()) {
    const sb = await serviceClient();
    await ensureBucket();
    const { error } = await sb.storage.from(BUCKET).upload(storagePath, bytes, { contentType, upsert: true });
    if (error) throw error;
    return;
  }
  const full = path.resolve(process.cwd(), "data/uploads", storagePath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, bytes);
}

export async function getFile(storagePath: string): Promise<Buffer> {
  if (hasSupabaseStorage()) {
    const sb = await serviceClient();
    const { data, error } = await sb.storage.from(BUCKET).download(storagePath);
    if (error || !data) throw error ?? new Error("File not found in storage");
    return Buffer.from(await data.arrayBuffer());
  }
  const full = path.resolve(process.cwd(), "data/uploads", storagePath);
  return fs.readFile(full);
}

export async function deleteFile(storagePath: string) {
  try {
    if (hasSupabaseStorage()) {
      const sb = await serviceClient();
      await sb.storage.from(BUCKET).remove([storagePath]);
      return;
    }
    await fs.rm(path.resolve(process.cwd(), "data/uploads", storagePath), { force: true });
  } catch {
    /* ignore */
  }
}
