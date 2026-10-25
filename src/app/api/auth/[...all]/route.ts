import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth/auth";

export const dynamic = "force-dynamic";

/**
 * The panel signs in through a server action (src/app/admin/_actions/session.ts),
 * which applies our own attempt limits and audit log. Better Auth's HTTP
 * endpoints are not used by the app, so only the harmless ones stay open:
 * otherwise anyone could POST /api/auth/sign-in/email and skip those limits.
 */
const ALLOWED: Record<string, readonly string[]> = {
  GET: ["/api/auth/get-session", "/api/auth/ok"],
  POST: ["/api/auth/sign-out"],
};

function allowed(req: Request) {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  return ALLOWED[req.method]?.includes(path) ?? false;
}

const notFound = () => new Response("Not found", { status: 404 });
const handler = () => toNextJsHandler(getAuth());

export const GET = (req: Request) => (allowed(req) ? handler().GET(req) : notFound());
export const POST = (req: Request) => (allowed(req) ? handler().POST(req) : notFound());
