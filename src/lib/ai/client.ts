import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicKey, getSettings } from "../settings";

export async function getAnthropic(): Promise<{ client: Anthropic; model: string } | null> {
  const key = await getAnthropicKey();
  if (!key) return null;
  const settings = await getSettings();
  return { client: new Anthropic({ apiKey: key, maxRetries: 3, timeout: 10 * 60 * 1000 }), model: settings.aiModel || "claude-opus-5-5" };
}

/** Extracts the first JSON object/array from a text response (structured outputs return pure JSON, this is a safety net). */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = Math.min(...[trimmed.indexOf("{"), trimmed.indexOf("[")].filter((i) => i >= 0));
    const end = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("Model did not return JSON");
  }
}
