import { NextResponse } from "next/server";
import { clearSession, getSession } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

export async function POST(req: Request) {
  const session = await getSession();
  if (session) await recordAudit({ action: "auth.logout", entity: "session", summary: `${session.name} signed out` });
  await clearSession();
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}
