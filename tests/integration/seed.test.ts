import { count } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appointments, professionals, scheduleExceptions } from "@/db/schema";
import { seedDemo, type SeedResult } from "@/db/seed";
import { resetDb, testDb } from "./helpers";

const holder = testDb();
const db = holder.db;
afterAll(() => holder.sql.end());

describe("seedDemo", () => {
  let result: SeedResult;
  beforeAll(async () => {
    await resetDb(db);
    result = await seedDemo(db, new Date("2026-10-21T15:00:00Z"));
  });

  it("creates the required demo catalog", () => {
    expect(result).toMatchObject({ clinics: 2, locations: 3, specialties: 8, professionals: 12 });
    expect(result.holidays).toBeGreaterThan(40);
  });

  it("creates sample appointments through the real booking service", async () => {
    const [{ n }] = await db.select({ n: count() }).from(appointments);
    expect(n).toBe(result.appointments);
    expect(n).toBeGreaterThanOrEqual(10);
  });

  it("has professionals and exceptions", async () => {
    const [{ p }] = await db.select({ p: count() }).from(professionals);
    const [{ e }] = await db.select({ e: count() }).from(scheduleExceptions);
    expect(p).toBe(12);
    expect(e).toBe(result.holidays + 3);
  });
});
