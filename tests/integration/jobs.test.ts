import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { emailOutbox, jobRuns } from "@/db/schema";
import { createAppointment } from "@/server/appointments/create";
import { jobStatus, resetJobClock, runDueJobs } from "@/server/jobs";
import { ar, makeFixture, patient, resetDb, testDb } from "./helpers";

const holder = testDb(10);
const db = holder.db;
afterAll(() => holder.sql.end());

const NOW = ar("2026-10-26", "08:00");

beforeEach(async () => {
  await resetDb(db);
  resetJobClock();
  delete process.env.SMTP_HOST; // preview mode
});

describe("background jobs", () => {
  it("runs every job, sends the queue and records the run", async () => {
    const f = await makeFixture(db);
    await createAppointment(
      db,
      { professionalId: f.prof.id, locationId: f.locA.id, serviceId: f.svc.id, startsAt: ar("2026-11-02", "10:00"), patient: patient(1), consent: true },
      { source: "form", now: NOW },
    );
    const r = await runDueJobs(db, { now: NOW });
    expect(r).toMatchObject({ outbox: { preview: 1 }, reminders: { queued: 0 }, housekeeping: { rateLimitsDeleted: 0 } });
    const [row] = await db.select().from(emailOutbox);
    expect(row.status).toBe("preview");
    expect((await jobStatus(db)).map((j) => j.name)).toEqual(["housekeeping", "outbox", "reminders"]);
  });

  it("respects each job's interval unless forced", async () => {
    await runDueJobs(db, { now: NOW });
    const again = await runDueJobs(db, { now: new Date(NOW.getTime() + 30_000) });
    expect(Object.keys(again)).toEqual([]);
    const later = await runDueJobs(db, { now: new Date(NOW.getTime() + 61_000) });
    expect(Object.keys(later)).toEqual(["outbox"]);
    const forced = await runDueJobs(db, { now: new Date(NOW.getTime() + 62_000), force: true });
    expect(Object.keys(forced).sort()).toEqual(["housekeeping", "outbox", "reminders"]);
    expect(await db.select().from(jobRuns)).toHaveLength(3);
  });
});
