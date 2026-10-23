import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { scheduleExceptions, users } from "@/db/schema";
import { getAgendaMonth } from "@/server/admin/agenda";
import { cancelAppointment } from "@/server/appointments/manage";
import { createAppointment } from "@/server/appointments/create";
import type { Actor } from "@/server/auth/rbac";
import { ar, makeFixture, patient, resetDb, testDb, type Fixture } from "./helpers";

const holder = testDb(5);
const db = holder.db;
afterAll(() => holder.sql.end());

const NOW = ar("2026-10-26", "08:00");
let f: Fixture;
let staff: Actor;

async function mkUser(role: Actor["role"], clinicId: string | null): Promise<Actor> {
  const id = randomUUID();
  const u = { id, name: `${role} user`, email: `${role}-${id}@x.example`, role, clinicId };
  await db.insert(users).values({ ...u, active: true });
  return u;
}

const book = (startsAt: Date, n: number) =>
  createAppointment(
    db,
    { professionalId: f.prof.id, locationId: f.locA.id, serviceId: f.svc.id, startsAt, patient: patient(n), consent: true },
    { source: "admin", now: NOW },
  );

beforeEach(async () => {
  await resetDb(db);
  f = await makeFixture(db);
  staff = await mkUser("staff", f.clinic.id);
});

describe("agenda month summary", () => {
  it("counts appointments, occupancy, cancellations and closed days per date", async () => {
    // Mon 2 Nov: two 30-minute appointments over 4 h open (09–13).
    await book(ar("2026-11-02", "09:00"), 1);
    await book(ar("2026-11-02", "10:00"), 2);
    // Tue 3 Nov: one booked then cancelled.
    const c = await book(ar("2026-11-03", "09:00"), 3);
    await cancelAppointment(db, c.appointment.id, { kind: "patient", channel: "form" }, NOW);
    // A clinic holiday on Mon 23 Nov.
    await db.insert(scheduleExceptions).values({
      clinicId: f.clinic.id,
      scope: "clinic",
      kind: "block",
      startsAt: ar("2026-11-23", "00:00"),
      endsAt: ar("2026-11-24", "00:00"),
      reason: "Feriado: Día de la Soberanía Nacional",
    });

    const m = await getAgendaMonth(db, staff, f.clinic.id, { mode: "professional", subjectId: f.prof.id, month: "2026-11" });

    expect(Object.keys(m.days)).toHaveLength(30);
    expect(m.days["2026-11-02"]).toMatchObject({ appointments: 2, cancelled: 0, openMinutes: 240, bookedMinutes: 60, closedReason: null });
    // Tuesday also has the afternoon block at location B (15–18).
    expect(m.days["2026-11-03"]).toMatchObject({ appointments: 0, cancelled: 1, openMinutes: 240 + 180 });
    expect(m.days["2026-11-23"]).toMatchObject({ openMinutes: 0, closedReason: "Feriado: Día de la Soberanía Nacional" });
    expect(m.days["2026-11-01"]).toMatchObject({ openMinutes: 0, appointments: 0, closedReason: null }); // Sunday
  });

  it("filters by location and refuses other clinics and bad months", async () => {
    await book(ar("2026-11-02", "09:00"), 1);
    const byB = await getAgendaMonth(db, staff, f.clinic.id, { mode: "location", subjectId: f.locB.id, month: "2026-11" });
    expect(byB.days["2026-11-02"].appointments).toBe(0);
    expect(byB.days["2026-11-03"].openMinutes).toBe(180);

    const other = await makeFixture(db);
    await expect(getAgendaMonth(db, staff, other.clinic.id, { mode: "location", subjectId: other.locA.id, month: "2026-11" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getAgendaMonth(db, staff, f.clinic.id, { mode: "location", subjectId: f.locA.id, month: "2026-13x" })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
