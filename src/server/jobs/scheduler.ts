import { getDb } from "@/db/client";
import { runDueJobs } from "./index";

const TICK_MS = 30_000;
const g = globalThis as unknown as { __turnosScheduler?: NodeJS.Timeout };

/**
 * In-process scheduler, started once per server from src/instrumentation.ts.
 * Turn it off with JOBS_ENABLED=false (for example when jobs run from cron
 * with `pnpm jobs`).
 */
export function startScheduler() {
  if (g.__turnosScheduler) return;
  if (!process.env.DATABASE_URL) {
    console.warn("[jobs] DATABASE_URL is not set: background jobs are off.");
    return;
  }
  let running = false;
  const tick = async () => {
    if (running) return; // a slow run never overlaps the next one
    running = true;
    try {
      await runDueJobs(getDb());
    } finally {
      running = false;
    }
  };
  g.__turnosScheduler = setInterval(tick, TICK_MS);
  g.__turnosScheduler.unref();
  setTimeout(tick, 5_000).unref();
  console.log("[jobs] scheduler started");
}
