import { lt, sql } from "drizzle-orm";
import { getDb, type DbOrTx } from "@/db/client";
import { rateLimits } from "@/db/schema";
import { blindIndex } from "@/lib/pii";

/**
 * Rate limiter backed by PostgreSQL, so limits hold across restarts and
 * several app instances.
 *
 * Fixed window: the first hit opens a window of `windowMs`; up to `limit`
 * hits pass inside it. One atomic upsert per call, so concurrent requests
 * cannot both slip through. Keys are stored as a keyed hash (they can
 * contain emails or IP hashes).
 */
export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSeconds: number };

const SWEEP_EVERY_MS = 10 * 60_000;
let lastSweep = 0;

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  opts: { db?: DbOrTx; now?: Date } = {},
): Promise<RateLimitResult> {
  const db = opts.db ?? getDb();
  const now = opts.now ?? new Date();
  const windowEnd = new Date(now.getTime() + windowMs);
  const k = blindIndex("ratelimit", key);
  const nowSql = sql`${now.toISOString()}::timestamptz`;

  const [row] = await db
    .insert(rateLimits)
    .values({ key: k, hits: 1, windowEndsAt: windowEnd })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        hits: sql`case when ${rateLimits.windowEndsAt} <= ${nowSql} then 1 else ${rateLimits.hits} + 1 end`,
        windowEndsAt: sql`case when ${rateLimits.windowEndsAt} <= ${nowSql} then excluded.window_ends_at else ${rateLimits.windowEndsAt} end`,
      },
    })
    .returning({ hits: rateLimits.hits, windowEndsAt: rateLimits.windowEndsAt });

  await maybeSweep(db, now);

  if (row.hits > limit) {
    const retry = Math.ceil((row.windowEndsAt.getTime() - now.getTime()) / 1000);
    return { ok: false, remaining: 0, retryAfterSeconds: Math.max(1, retry) };
  }
  return { ok: true, remaining: limit - row.hits, retryAfterSeconds: 0 };
}

/** Drop expired counters now and then (at most every 10 minutes per process). */
async function maybeSweep(db: DbOrTx, now: Date) {
  if (now.getTime() - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = now.getTime();
  try {
    await db.delete(rateLimits).where(lt(rateLimits.windowEndsAt, now));
  } catch (e) {
    console.error("[rate-limit] sweep failed:", e instanceof Error ? e.message : "unknown");
  }
}

/** For tests: let the next call sweep again. */
export function resetRateLimitSweep() {
  lastSweep = 0;
}
