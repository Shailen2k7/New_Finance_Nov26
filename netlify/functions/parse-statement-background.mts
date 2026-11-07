import type { Context } from "@netlify/functions";
import { runImportPipeline } from "../../src/lib/import/pipeline";

// Netlify background function (name ends with "-background"): returns 202 immediately and may run for up to 15 minutes.
export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = process.env.IMPORT_WORKER_SECRET;
  if (!secret || req.headers.get("x-worker-secret") !== secret) return new Response("Unauthorized", { status: 401 });
  const { batchId } = (await req.json()) as { batchId: string };
  if (!batchId) return new Response("Missing batchId", { status: 400 });
  await runImportPipeline(batchId);
  return new Response("ok");
};
