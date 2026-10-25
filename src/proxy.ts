import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs before every page:
 *
 * 1. Security headers, including a strict Content Security Policy with a
 *    fresh nonce per request. Next.js reads the nonce from the request's CSP
 *    header and puts it on its own scripts; the root layout reads `x-nonce`
 *    for the theme script. Scripts without the nonce do not run, which stops
 *    injected markup from executing code.
 * 2. Optimistic gate for /admin: without a session cookie, go to the login
 *    page. Only a UX shortcut — every admin page and action re-checks the
 *    session and the role on the server.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    const cookie = getSessionCookie(request, { cookiePrefix: "turnos" });
    if (!cookie) {
      const url = new URL("/admin/login", request.url);
      url.searchParams.set("next", pathname + search);
      return withSecurityHeaders(NextResponse.redirect(url), pathname, contentSecurityPolicy(newNonce()));
    }
  }

  const nonce = newNonce();
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  return withSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), pathname, csp);
}

const isHttps = () => (process.env.APP_URL ?? "").startsWith("https://");

function newNonce() {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

function contentSecurityPolicy(nonce: string) {
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    // React needs eval in development only, for readable server error stacks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Radix, Sonner and the day picker set inline style attributes, which a
    // nonce cannot cover. Styles cannot run code, so this is a small trade-off.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isHttps() ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

function withSecurityHeaders(res: NextResponse, pathname: string, csp: string) {
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  // Appointment links carry the cancel token in the URL: never send it on.
  res.headers.set("Referrer-Policy", pathname.startsWith("/turno") ? "no-referrer" : "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  // Only over HTTPS: browsers ignore it on plain HTTP, and it would pin
  // localhost to HTTPS during development.
  if (isHttps()) res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  return res;
}

export const config = {
  matcher: [
    // Every page and route handler except Next's static files, the API and the health check.
    "/((?!api/|_next/static|_next/image|favicon.ico|healthz).*)",
  ],
};
