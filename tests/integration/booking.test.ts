import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { appointmentEvents, appointments, patients, scheduleExceptions } from "@/db/schema";
import { decrypt } from "@/lib/pii";
import { tokenMatches } from "@/lib/codes";
import { createAppointment } from "@/server/appointments/create";
import { getAvailableSlots } from "@/server/availability/service";
import { DomainError, pgErrorCode } from "@/server/errors";
import { ar, makeFixture, patient, resetDb, testDb, type Fixture } from "./helpers";

const holder = testDb(30);
const db = holder.db;
afterAll(() => holder.sql.end());

// Monday 2026-11-02 … everything is booked "from" the previous week.
const NOW = ar("2026-10-26", "08:00");
const MON = "2026-11-02";
const TUE = "2026-11-03";

let f: Fixture;
beforeEach(async () => {
  await resetDb(db);
  f = await makeFixture(db);
});

const book = (startsAt: Date, n = 1, extra: Partial<Parameters<typeof createAppointment>[1]> = {}) =>
  createAppointment(
    db,
    {
      professionalId: f.prof.id,
      locationId: f.locA.id,
      serviceId: f.svc.id,
      startsAt,
      patient: patient(n),
      consent: true,
      ...extra,
    },
    { source: "form", now: NOW },
  );

describe("getAvailableSlots (database)", () => {
  it("returns the weekly grid for a day", async () => {
    const r = await getAvailableSlots(
      db,
      { professionalId: f.prof.id, serviceId: f.svc.id, from: ar(MON, "00:00"), to: ar(TUE, "00:00") },
      NOW,
    );
    expect(r.timezone).toBe("America/Argentina/Buenos_Aires");
    expect(r.slots.map((s) => s.localTime)).toEqual([
      "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
    ]);
  });

  it("combines locations and filters by one", async () => {
    const q = { professionalId: f.prof.id, serviceId: f.svc.id, from: ar(TUE, "00:00"), to: ar("2026-11-04", "00:00") };
    const all = await getAvailableSlots(db, q, NOW);
    expect(all.slots).toHaveLength(8 + 6);
    const onlyB = await getAvailableSlots(db, { ...q, locationId: f.locB.id }, NOW);
    expect(onlyB.slots.map((s) => s.localTime)).toEqual(["15:00", "15:30", "16:00", "16:30", "17:00", "17:30"]);
  });

  it("applies clinic holidays and professional vacations", async () => {
    await db.insert(scheduleExceptions).values([
      { clinicId: f.clinic.id, scope: "clinic", kind: "block", startsAt: ar(MON, "00:00"), endsAt: ar(TUE, "00:00"), reason: "Feriado" },
      {
        clinicId: f.clinic.id,
        scope: "professional",
        kind: "block",
        professionalId: f.prof.id,
        startsAt: ar(TUE, "15:00"),
        endsAt: ar(TUE, "16:00"),
        reason: "Trámite",
      },
    ]);
    const r = await getAvailableSlots(
      db,
      { professionalId: f.prof.id, serviceId: f.svc.id, from: ar(MON, "00:00"), to: ar("2026-11-04", "00:00") },
      NOW,
    );
    expect(r.slots.filter((s) => s.localDate === MON)).toEqual([]);
    expect(r.slots.filter((s) => s.locationId === f.locB.id).map((s) => s.localTime)).toEqual([
      "16:00", "16:30", "17:00", "17:30",
    ]);
  });

  it("clips results to the booking horizon", async () => {
    const r = await getAvailableSlots(
      db,
      { professionalId: f.prof.id, serviceId: f.svc.id, from: ar("2027-02-01", "00:00"), to: ar("2027-03-01", "00:00") },
      NOW,
    );
    // NOW + 120 days = 2027-02-23 08:00 local: Mon 22 is the last bookable day.
    const horizon = NOW.getTime() + 120 * 86_400_000;
    expect(r.slots.length).toBeGreaterThan(0);
    expect(r.slots.every((s) => s.startsAt.getTime() < horizon)).toBe(true);
    expect(r.slots.at(-1)?.localDate).toBe("2027-02-22");
  });

  it("rejects a location where the professional does not work", async () => {
    const other = (await makeFixture(db)).locA;
    await expect(
      getAvailableSlots(db, { professionalId: f.prof.id, serviceId: f.svc.id, locationId: other.id, from: ar(MON, "00:00"), to: ar(TUE, "00:00") }, NOW),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("createAppointment", () => {
  it("books a real slot, stores encrypted PII, hashed token and an event", async () => {
    const { appointment, cancelToken } = await book(ar(MON, "10:00"));
    expect(appointment.code).toMatch(/^T-[2-9A-Z]{6}$/);
    expect(appointment.status).toBe("confirmed");
    expect(appointment.endsAt.toISOString()).toBe(ar(MON, "10:30").toISOString());
    expect(tokenMatches(cancelToken, appointment.cancelTokenHash)).toBe(true);
    expect(appointment.cancelTokenHash).not.toContain(cancelToken);

    const [p] = await db.select().from(patients).where(eq(patients.id, appointment.patientId));
    expect(p.phoneEnc).not.toContain("5555");
    expect(decrypt(p.phoneEnc)).toBe("1155551001");
    expect(p.consentAt).not.toBeNull();

    const events = await db.select().from(appointmentEvents).where(eq(appointmentEvents.appointmentId, appointment.id));
    expect(events.map((e) => e.type)).toEqual(["created"]);
  });

  it("the booked slot disappears from availability", async () => {
    await book(ar(MON, "10:00"));
    const r = await getAvailableSlots(db, { professionalId: f.prof.id, serviceId: f.svc.id, from: ar(MON, "00:00"), to: ar(TUE, "00:00") }, NOW);
    expect(r.slots.map((s) => s.localTime)).not.toContain("10:00");
  });

  it("rejects a time that is not a real slot (invented hour)", async () => {
    await expect(book(ar(MON, "10:10"))).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
    await expect(book(ar(MON, "14:00"))).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
    await expect(book(ar("2026-11-07", "10:00"))).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" }); // Saturday
  });

  it("rejects a slot already taken", async () => {
    await book(ar(MON, "10:00"), 1);
    await expect(book(ar(MON, "10:00"), 2)).rejects.toBeInstanceOf(DomainError);
  });

  it("rejects a 60-minute service that would overlap the next appointment", async () => {
    await book(ar(MON, "10:30"), 1);
    await expect(book(ar(MON, "10:00"), 2, { serviceId: f.longSvc.id })).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
  });

  it("requires consent for patient-facing bookings", async () => {
    await expect(book(ar(MON, "10:00"), 1, { consent: false })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("reuses the patient for the same phone + name, separates family members", async () => {
    await book(ar(MON, "09:00"), 1);
    await book(ar(MON, "09:30"), 1);
    await book(ar(MON, "10:00"), 1, { patient: { ...patient(1), fullName: "Hijo De Prueba" } });
    const rows = await db.select().from(patients);
    expect(rows).toHaveLength(2);
  });
});

describe("anti double-booking", () => {
  it("only one of many concurrent bookings for the same slot wins", async () => {
    const attempts = 12;
    const results = await Promise.allSettled(
      Array.from({ length: attempts }, (_, i) => book(ar(MON, "11:00"), i + 1)),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(attempts - 1);
    for (const f of failed) {
      expect(f.reason).toBeInstanceOf(DomainError);
      expect(["SLOT_TAKEN", "SLOT_UNAVAILABLE"]).toContain((f.reason as DomainError).code);
    }
    const rows = await db
      .select()
      .from(appointments)
      .where(and(eq(appointments.professionalId, f.prof.id), eq(appointments.startsAt, ar(MON, "11:00"))));
    expect(rows).toHaveLength(1);
  });

  it("when both requests pass the app-level check, the database still lets only one through (SLOT_TAKEN)", async () => {
    // allowOutsideGrid skips the availability re-check, so both transactions
    // reach the INSERT: the exclusion constraint is the only guard left.
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        createAppointment(
          db,
          { professionalId: f.prof.id, locationId: f.locA.id, serviceId: f.svc.id, startsAt: ar(MON, "12:00"), patient: patient(i + 1), consent: true },
          { source: "admin", now: NOW, allowOutsideGrid: true },
        ),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) {
      if (r.status === "rejected") expect((r.reason as DomainError).code).toBe("SLOT_TAKEN");
    }
  });

  it("concurrent overlapping bookings of different lengths: only one wins", async () => {
    const results = await Promise.allSettled([
      book(ar(MON, "11:00"), 1, { serviceId: f.longSvc.id }), // 11:00–12:00
      book(ar(MON, "11:30"), 2), // 11:30–12:00
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("the database itself rejects overlaps even bypassing the service layer", async () => {
    const { appointment } = await book(ar(MON, "12:00"));
    const err = await db
      .insert(appointments)
      .values({ ...appointment, id: undefined as never, during: undefined as never, code: "T-ZZZZZZ", startsAt: ar(MON, "12:15"), endsAt: ar(MON, "12:45") })
      .catch((e: unknown) => e);
    expect(pgErrorCode(err)).toBe("23P01");
  });

  it("back-to-back appointments are allowed and cancelled ones free the slot", async () => {
    const a = await book(ar(MON, "09:00"), 1);
    await book(ar(MON, "09:30"), 2);
    await db.update(appointments).set({ status: "cancelled_by_patient" }).where(eq(appointments.id, a.appointment.id));
    await expect(book(ar(MON, "09:00"), 3)).resolves.toBeTruthy();
  });

  it("the exclusion constraint exists in the schema", async () => {
    const rows = await db.execute(sql`select conname from pg_constraint where conname = 'appointments_no_overlap'`);
    expect(rows).toHaveLength(1);
  });
});
