import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { rateLimits } from "@/db/schema";
import { rateLimit, resetRateLimitSweep } from "@/server/security/rate-limit";
import { resetDb, testDb } from "./helpers";

const { db, sql: conn } = testDb();
afterAll(() => conn.end({ timeout: 5 }));
beforeEach(async () => {
  await resetDb(db);
  resetRateLimitSweep();
});

const T = new Date("2026-11-02T12:00:00Z");
const at = (ms: number) => new Date(T.getTime() + ms);

describe("rateLimit (PostgreSQL)", () => {
  it("allows up to the limit inside the window, then blocks", async () => {
    for (let i = 0; i < 3; i++) expect((await rateLimit("k", 3, 60_000, { db, now: at(i) })).ok).toBe(true);
    const r = await rateLimit("k", 3, 60_000, { db, now: at(10) });
    expect(r.ok).toBe(false);
    expect(r.retryAfterSeconds).toBe(60);
  });

  it("opens a new window once the previous one ends", async () => {
    await rateLimit("k", 1, 1000, { db, now: at(0) });
    expect((await rateLimit("k", 1, 1000, { db, now: at(500) })).ok).toBe(false);
    expect((await rateLimit("k", 1, 1000, { db, now: at(1000) })).ok).toBe(true);
  });

  it("keys are independent", async () => {
    await rateLimit("a", 1, 1000, { db, now: at(0) });
    expect((await rateLimit("b", 1, 1000, { db, now: at(0) })).ok).toBe(true);
  });

  it("concurrent hits never let more than the limit through", async () => {
    const results = await Promise.all(Array.from({ length: 25 }, () => rateLimit("burst", 5, 60_000, { db, now: at(0) })));
    expect(results.filter((r) => r.ok)).toHaveLength(5);
  });

  it("stores a keyed hash, never the key itself", async () => {
    await rateLimit("login:email:ana@example.com", 5, 60_000, { db, now: at(0) });
    const rows = await db.select().from(rateLimits);
    expect(rows).toHaveLength(1);
    expect(rows[0].key).not.toContain("ana");
  });

  it("sweeps expired counters", async () => {
    await rateLimit("old", 5, 1000, { db, now: at(0) });
    resetRateLimitSweep();
    await rateLimit("new", 5, 1000, { db, now: at(5000) });
    const rows = await db.select().from(rateLimits);
    expect(rows).toHaveLength(1);
  });
});
