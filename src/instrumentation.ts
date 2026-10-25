import type { Instrumentation } from "next";

/** Runs once per server start. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { checkStartupConfig } = await import("./server/startup");
  checkStartupConfig();
  if (process.env.JOBS_ENABLED === "false" || process.env.JOBS_ENABLED === "0") return;
  const { startScheduler } = await import("./server/jobs/scheduler");
  startScheduler();
}

/**
 * Server errors, one JSON line each (easy to ship from Docker logs to any
 * monitor). Only the route and the error, never headers, bodies or query
 * strings: they can carry patient data or the cancel token.
 * With ERROR_WEBHOOK_URL set, the same JSON is POSTed there (Slack, a log
 * collector, an uptime tool…).
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const e = err as { message?: string; digest?: string; name?: string };
  const entry = {
    level: "error",
    at: new Date().toISOString(),
    method: request.method,
    route: context.routePath,
    type: context.routeType,
    path: request.path.split("?")[0],
    error: (e?.name ?? "Error") + ": " + String(e?.message ?? err).slice(0, 500),
    digest: e?.digest,
  };
  console.error(JSON.stringify(entry));
  const url = process.env.ERROR_WEBHOOK_URL;
  if (url) {
    try {
      await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: `Turnos IA: ${entry.error} (${entry.method} ${entry.route})`, ...entry }),
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      // never let reporting break the response
    }
  }
};
