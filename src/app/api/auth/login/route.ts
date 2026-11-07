import { NextResponse } from "next/server";
import { createSession, getEffectivePassword } from "@/lib/auth";
import { timingSafeEqual } from "@/lib/auth-edge";
import { recordAudit } from "@/lib/audit";

export async function POST(req: Request) {
  const { name, password } = (await req.json().catch(() => ({}))) as { name?: string; password?: string };
  const cleanName = (name ?? "").trim().replace(/\s+/g, " ");
  if (cleanName.length < 2 || cleanName.length > 40) return NextResponse.json({ error: "Enter your name (2–40 characters)" }, { status: 400 });
  const expected = await getEffectivePassword().catch(() => null);
  if (!expected) return NextResponse.json({ error: "Login is not set up yet. Set APP_PASSWORD on the server." }, { status: 503 });
  if (typeof password !== "string" || !timingSafeEqual(password, expected)) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }
  await createSession(cleanName);
  await recordAudit({ action: "auth.login", entity: "session", summary: `${cleanName} signed in` });
  return NextResponse.json({ ok: true, name: cleanName });
}
