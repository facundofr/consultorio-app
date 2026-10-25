/**
 * Background jobs. Each one is idempotent and safe to run on several app
 * instances at the same time (rows are claimed, sweeps are plain deletes),
 * so no leader election is needed.
 *
 *   outbox        every minute     send queued emails
 *   reminders     every 5 minutes  queue appointment reminders
 *   housekeeping  every hour       retention of chats, email content and rate-limit counters
 */
import { lt, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { jobRuns, rateLimits } from "@/db/schema";
import { assistantConfig } from "@/server/assistant/config";
import { sweepConversations } from "@/server/assistant/engine";
import { flushOutbox, purgeOutbox, queueReminders } from "@/server/email/worker";

type Job = { name: string; everyMs: number; run: (db: Db, now: Date) => Promise<Record<string, unknown>> };

const MINUTE = 60_000;

export const JOBS: Job[] = [
  { name: "outbox", everyMs: MINUTE, run: (db, now) => flushOutbox(db, { now }) },
  { name: "reminders", everyMs: 5 * MINUTE, run: (db, now) => queueReminders(db, now) },
  {
    name: "housekeeping",
    everyMs: 60 * MINUTE,
    run: async (db, now) => {
      const chats = await sweepConversations(db, assistantConfig().retentionDays, now);
      const emails = await purgeOutbox(db, now);
      const limits = await db.delete(rateLimits).where(lt(rateLimits.windowEndsAt, now)).returning({ k: rateLimits.key });
      return { chatsDeleted: chats.deleted, emailContentWiped: emails.wiped, emailRowsDeleted: emails.deleted, rateLimitsDeleted: limits.length };
    },
  },
];

const lastRun = new Map<string, number>();

/** Run the jobs that are due (all of them with `force`). Never throws: failures are logged and recorded. */
export async function runDueJobs(db: Db, opts: { now?: Date; force?: boolean } = {}) {
  const now = opts.now ?? new Date();
  const results: Record<string, unknown> = {};
  for (const job of JOBS) {
    const prev = lastRun.get(job.name) ?? 0;
    if (!opts.force && now.getTime() - prev < job.everyMs) continue;
    lastRun.set(job.name, now.getTime());
    let result: Record<string, unknown>;
    try {
      result = await job.run(db, now);
    } catch (e) {
      result = { error: e instanceof Error ? e.message.slice(0, 200) : "unknown" };
      console.error(`[jobs] ${job.name} failed:`, result.error);
    }
    results[job.name] = result;
    try {
      await db
        .insert(jobRuns)
        .values({ name: job.name, lastRunAt: now, lastResult: result })
        .onConflictDoUpdate({ target: jobRuns.name, set: { lastRunAt: now, lastResult: result } });
    } catch {
      // bookkeeping only
    }
  }
  return results;
}

/** For tests. */
export function resetJobClock() {
  lastRun.clear();
}

/** Last run of every job, for the panel. */
export async function jobStatus(db: Db) {
  return db.select().from(jobRuns).orderBy(sql`${jobRuns.name}`);
}
