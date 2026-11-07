import { createHash } from "node:crypto";

export function normalizeDescription(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Stable base fingerprint for a transaction as it appears on a statement. */
export function fingerprintBase(accountId: string, dateISO: string, amountMinor: number, description: string): string {
  const h = createHash("sha256").update(`${accountId}|${dateISO}|${amountMinor}|${normalizeDescription(description)}`).digest("hex");
  return h.slice(0, 32);
}

export function fingerprintWithIndex(base: string, k: number): string {
  return `${base}#${k}`;
}

export function manualFingerprint(): string {
  return `manual:${createHash("sha256").update(`${Date.now()}:${Math.random()}`).digest("hex").slice(0, 24)}`;
}
