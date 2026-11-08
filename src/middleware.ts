import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionSecret, verifySessionToken } from "./lib/auth-edge";

const PUBLIC = [/^\/login/, /^\/api\/auth\//, /^\/api\/worker\//, /^\/api\/health$/, /^\/offline\.html$/];

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
  // App files (icons, manifest, service worker) must load without signing in, or phones cannot install the app.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|icons/|apple-touch-icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
