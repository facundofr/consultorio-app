import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic gate for /admin: without a session cookie, go to the login page.
 * This is only a UX shortcut — every admin page and action re-checks the
 * session and the role on the server.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    const cookie = getSessionCookie(request, { cookiePrefix: "turnos" });
    if (!cookie) {
      const url = new URL("/admin/login", request.url);
      url.searchParams.set("next", pathname + search);
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
