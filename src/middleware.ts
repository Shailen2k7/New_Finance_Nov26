import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionSecret, verifySessionToken } from "./lib/auth-edge";

const PUBLIC = [/^\/login/, /^\/api\/auth\//, /^\/api\/worker\//];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC.some((re) => re.test(path));
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, sessionSecret());

  if (!session && !isPublic) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.search = "";
    if (path !== "/") redirect.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(redirect);
  }
  if (session && path.startsWith("/login")) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
