/**
 * In-memory sliding-window rate limiter. The app runs as a single instance
 * (see DECISIONS.md); with several instances move this to Postgres/Redis.
 */
type Bucket = { hits: number[] };
const buckets = new Map<string, Bucket>();
let lastSweep = 0;

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSeconds: number };

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  if (now - lastSweep > 60_000) sweep(now, windowMs);
  const b = buckets.get(key) ?? { hits: [] };
  b.hits = b.hits.filter((t) => now - t < windowMs);
  if (b.hits.length >= limit) {
    buckets.set(key, b);
    const retry = Math.ceil((b.hits[0] + windowMs - now) / 1000);
    return { ok: false, remaining: 0, retryAfterSeconds: Math.max(1, retry) };
  }
  b.hits.push(now);
  buckets.set(key, b);
  return { ok: true, remaining: limit - b.hits.length, retryAfterSeconds: 0 };
}

function sweep(now: number, windowMs: number) {
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (!b.hits.some((t) => now - t < Math.max(windowMs, 3_600_000))) buckets.delete(k);
  }
}

export function resetRateLimits() {
  buckets.clear();
}
