import { runImportPipeline } from "./pipeline";

/**
 * Starts processing for a batch. On Netlify, hands off to the background function (15 min limit).
 * Locally (or with IMPORT_RUNNER=inline), runs in-process after the response is sent.
 */
export async function triggerProcessing(batchId: string): Promise<"background" | "inline"> {
  const onNetlify = process.env.NETLIFY === "true" && process.env.IMPORT_RUNNER !== "inline";
  if (onNetlify) {
    const base = process.env.URL || process.env.DEPLOY_PRIME_URL || "";
    try {
      const res = await fetch(`${base}/.netlify/functions/parse-statement-background`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-worker-secret": process.env.IMPORT_WORKER_SECRET ?? "" },
        body: JSON.stringify({ batchId }),
      });
      if (res.status === 202 || res.ok) return "background";
      console.error("Background worker rejected request", res.status);
    } catch (e) {
      console.error("Background worker unreachable, running inline", e);
    }
  }
  const { after } = await import("next/server");
  after(() => runImportPipeline(batchId));
  return "inline";
}
