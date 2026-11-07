import { cookies } from "next/headers";
import { getSettings } from "./settings";
import { SESSION_COOKIE, SESSION_MAX_AGE, sessionSecret, signSessionToken, verifySessionToken } from "./auth-edge";

export type Session = { name: string };

export async function createSession(name: string): Promise<void> {
  const token = await signSessionToken({ name: name.trim(), iat: Math.floor(Date.now() / 1000) }, sessionSecret());
  const store = await cookies();
  store.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: SESSION_MAX_AGE, path: "/" });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 0, path: "/" });
}

export async function getSession(): Promise<Session | null> {
  try {
    const store = await cookies();
    const payload = await verifySessionToken(store.get(SESSION_COOKIE)?.value, sessionSecret());
    return payload ? { name: payload.name } : null;
  } catch {
    return null;
  }
}

/** The shared password: environment variable wins, otherwise the value stored in Settings. */
export async function getEffectivePassword(): Promise<string> {
  if (process.env.APP_PASSWORD) return process.env.APP_PASSWORD;
  const s = await getSettings();
  const stored = s.sharedPassword || "migrizo";
  if (process.env.NODE_ENV === "production" && stored === "migrizo") throw new Error("APP_PASSWORD is not set");
  return stored;
}

export const passwordFromEnv = () => Boolean(process.env.APP_PASSWORD);
