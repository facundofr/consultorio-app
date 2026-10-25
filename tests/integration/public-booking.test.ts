import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { appointmentEvents, appointments, professionalLocations, professionals, professionalSpecialties, scheduleRules, settings } from "@/db/schema";
import {
  availableDays,
  bookPublic,
  cancelPublic,
  findAppointmentPublic,
  findSlots,
  listProfessionalsPublic,
  listServicesPublic,
  listSpecialtiesPublic,
} from "@/server/booking/public";
import { DomainError } from "@/server/errors";
import { ar, makeFixture, patient, resetDb, testDb, type Fixture } from "./helpers";

const holder = testDb(20);
const db = holder.db;
afterAll(() => holder.sql.end());

const NOW = ar("2026-10-26", "08:00"); // Monday
const MON = "2026-11-02";
const H = 3_600_000;

let f: Fixture;
let second: { id: string };

beforeEach(async () => {
  await resetDb(db);
  f = await makeFixture(db);
  // A second professional of the same specialty, Mondays 14–15 at location A.
  const [p2] = await db.insert(professionals).values({ clinicId: f.clinic.id, title: "Dr.", firstName: "Bruno", lastName: "Segundo" }).returning();
  await db.insert(professionalSpecialties).values({ professionalId: p2.id, specialtyId: f.spec.id });
  await db.insert(professionalLocations).values({ professionalId: p2.id, locationId: f.locA.id });
  await db.insert(scheduleRules).values({ professionalId: p2.id, locationId: f.locA.id, weekday: 1, startTime: "14:00", endTime: "15:00" });
  second = p2;
});

const book = (startsAt: Date, n = 1, now = NOW) =>
  bookPublic(
    db,
    { professionalId: f.prof.id, locationId: f.locA.id, serviceId: f.svc.id, startsAt, patient: patient(n), consent: true },
    { source: "form", now },
  );

describe("public catalog", () => {
  it("lists only what is bookable", async () => {
    expect((await listSpecialtiesPublic(db, f.clinic.id)).map((s) => s.id)).toEqual([f.spec.id]);
    expect((await listSpecialtiesPublic(db, f.clinic.id, f.locB.id)).map((s) => s.id)).toEqual([f.spec.id]);
    expect((await listProfessionalsPublic(db, f.clinic.id, f.spec.id)).map((p) => p.name).sort()).toEqual(["Dr. Bruno Segundo", "Dra. Ana Prueba"]);
    expect((await listProfessionalsPublic(db, f.clinic.id, f.spec.id, f.locB.id)).map((p) => p.name)).toEqual(["Dra. Ana Prueba"]);
    expect((await listServicesPublic(db, f.clinic.id, f.spec.id)).map((s) => s.durationMinutes)).toEqual([30, 60]);
  });

  it("hides inactive professionals", async () => {
    await db.update(professionals).set({ active: false }).where(eq(professionals.id, second.id));
    expect(await listProfessionalsPublic(db, f.clinic.id, f.spec.id)).toHaveLength(1);
  });
});

describe("findSlots", () => {
  const q = () => ({ clinicId: f.clinic.id, specialtyId: f.spec.id, serviceId: f.svc.id, fromDate: MON, toDate: MON });

  it("merges every professional for «el primero disponible»", async () => {
    const r = await findSlots(db, q(), NOW);
    expect(r.slots.map((s) => s.localTime)).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "14:00", "14:30"]);
    expect(r.slots.at(-1)?.professionalId).toBe(second.id);
  });

  it("filters by professional and location", async () => {
    const r = await findSlots(db, { ...q(), professionalId: second.id }, NOW);
    expect(r.slots.map((s) => s.localTime)).toEqual(["14:00", "14:30"]);
    const tue = await findSlots(db, { ...q(), fromDate: "2026-11-03", toDate: "2026-11-03", locationId: f.locB.id }, NOW);
    expect(new Set(tue.slots.map((s) => s.locationId))).toEqual(new Set([f.locB.id]));
  });

  it("never returns past days, and clips to the horizon", async () => {
    const past = await findSlots(db, { ...q(), fromDate: "2026-10-01", toDate: "2026-10-26" }, NOW);
    expect(past.slots.every((s) => s.localDate >= "2026-10-26")).toBe(true);
    const far = await findSlots(db, { ...q(), fromDate: "2027-12-01", toDate: "2027-12-31" }, NOW);
    expect(far.slots).toEqual([]);
  });

  it("rejects a service of another specialty", async () => {
    const other = await makeFixture(db);
    await expect(findSlots(db, { ...q(), serviceId: other.svc.id }, NOW)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("lists the days that have availability", async () => {
    const { days } = await availableDays(db, { clinicId: f.clinic.id, specialtyId: f.spec.id, serviceId: f.svc.id, fromDate: "2026-11-02", toDate: "2026-11-08" }, NOW);
    expect(days).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]);
  });
});

describe("bookPublic", () => {
  it("requires explicit consent", async () => {
    await expect(
      bookPublic(db, { professionalId: f.prof.id, locationId: f.locA.id, serviceId: f.svc.id, startsAt: ar(MON, "09:00"), patient: patient(1), consent: false as never }, { source: "form", now: NOW }),
    ).rejects.toBeTruthy();
  });

  it("books with source form", async () => {
    const r = await book(ar(MON, "09:00"));
    expect(r.appointment.source).toBe("form");
  });
});

describe("lookup with a second factor", () => {
  it("finds by code + token, phone (any format) or email; otherwise the same not-found error", async () => {
    const { appointment, cancelToken } = await book(ar(MON, "09:00"), 3);
    const byToken = await findAppointmentPublic(db, appointment.code, { token: cancelToken }, NOW);
    expect(byToken.professionalName).toBe("Dra. Ana Prueba");
    expect(byToken.patientFirstName).toBe("Paciente");
    expect(byToken.cancel.allowed).toBe(true);
    await expect(findAppointmentPublic(db, appointment.code.toLowerCase(), { phone: "011 15 5555-1003" }, NOW)).resolves.toBeTruthy();
    await expect(findAppointmentPublic(db, appointment.code.slice(2), { email: "PACIENTE3@example.com " }, NOW)).resolves.toBeTruthy();

    const errors = await Promise.all([
      findAppointmentPublic(db, appointment.code, { token: cancelToken + "x" }, NOW).catch((e) => e),
      findAppointmentPublic(db, appointment.code, { phone: "11 5555-9999" }, NOW).catch((e) => e),
      findAppointmentPublic(db, appointment.code, {}, NOW).catch((e) => e),
      findAppointmentPublic(db, "T-ZZZZZZ", { token: cancelToken }, NOW).catch((e) => e),
      findAppointmentPublic(db, "garbage", { token: cancelToken }, NOW).catch((e) => e),
    ]);
    for (const e of errors) {
      expect(e).toBeInstanceOf(DomainError);
      expect((e as DomainError).userMessage).toBe(errors[0].userMessage);
    }
  });
});

describe("patient cancellation (server clock, inside the transaction)", () => {
  it("cancels at exactly 24 h 00 m 00 s before and frees the slot", async () => {
    const start = ar(MON, "10:00");
    const { appointment, cancelToken } = await book(start);
    const v = await cancelPublic(db, appointment.code, { token: cancelToken }, "link", new Date(start.getTime() - 24 * H));
    expect(v.status).toBe("cancelled_by_patient");
    const [ev] = await db.select().from(appointmentEvents).where(eq(appointmentEvents.type, "cancelled"));
    expect(ev.data).toEqual({ channel: "link" });
    await expect(book(start, 2)).resolves.toBeTruthy();
  });

  it("refuses at 23 h 59 m 59 s and shows the clinic phone", async () => {
    const start = ar(MON, "10:00");
    const { appointment, cancelToken } = await book(start);
    const err = await cancelPublic(db, appointment.code, { token: cancelToken }, "link", new Date(start.getTime() - 24 * H + 1000)).catch((e) => e);
    expect(err).toMatchObject({ code: "CANCEL_WINDOW_PASSED" });
    expect((err as DomainError).userMessage).toContain("011 4000-0000");
    const [row] = await db.select().from(appointments).where(eq(appointments.id, appointment.id));
    expect(row.status).toBe("confirmed");
  });

  it("refuses after the appointment already happened", async () => {
    const start = ar(MON, "10:00");
    const { appointment, cancelToken } = await book(start);
    await expect(cancelPublic(db, appointment.code, { token: cancelToken }, "link", new Date(start.getTime() + H))).rejects.toMatchObject({ code: "CANCEL_WINDOW_PASSED" });
  });

  it("refuses an already cancelled appointment", async () => {
    const { appointment, cancelToken } = await book(ar(MON, "10:00"));
    await cancelPublic(db, appointment.code, { token: cancelToken }, "link", NOW);
    await expect(cancelPublic(db, appointment.code, { token: cancelToken }, "link", NOW)).rejects.toMatchObject({ code: "ALREADY_CANCELLED" });
  });

  it("a double cancellation at the same time succeeds only once", async () => {
    const { appointment, cancelToken } = await book(ar(MON, "10:00"));
    const results = await Promise.allSettled([
      cancelPublic(db, appointment.code, { token: cancelToken }, "link", NOW),
      cancelPublic(db, appointment.code, { phone: patient(1).phone }, "chat", NOW),
      cancelPublic(db, appointment.code, { email: patient(1).email }, "form", NOW),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) if (r.status === "rejected") expect(r.reason).toMatchObject({ code: "ALREADY_CANCELLED" });
    const events = await db.select().from(appointmentEvents).where(eq(appointmentEvents.appointmentId, appointment.id));
    expect(events.filter((e) => e.type === "cancelled")).toHaveLength(1);
  });

  it("uses the hours configured for the clinic", async () => {
    await db.update(settings).set({ cancelMinHours: 48 }).where(eq(settings.clinicId, f.clinic.id));
    const start = ar(MON, "10:00");
    const { appointment, cancelToken } = await book(start);
    await expect(cancelPublic(db, appointment.code, { token: cancelToken }, "link", new Date(start.getTime() - 30 * H))).rejects.toMatchObject({ code: "CANCEL_WINDOW_PASSED" });
    await expect(cancelPublic(db, appointment.code, { token: cancelToken }, "link", new Date(start.getTime() - 48 * H))).resolves.toBeTruthy();
  });
});

describe("returning patients", () => {
  it("a public booking cannot replace an existing patient's email", async () => {
    const victim = await book(ar(MON, "10:00"));
    // Someone who knows the victim's phone and name books with their own email.
    await bookPublic(
      db,
      { professionalId: f.prof.id, locationId: f.locA.id, serviceId: f.svc.id, startsAt: ar(MON, "11:00"), patient: { ...patient(1), email: "intruso@example.com" }, consent: true },
      { source: "form", now: NOW },
    );
    // The intruder's email does not open the victim's appointment…
    await expect(findAppointmentPublic(db, victim.appointment.code, { email: "intruso@example.com" }, NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
    // …and the victim's own email still does.
    await expect(findAppointmentPublic(db, victim.appointment.code, { email: patient(1).email }, NOW)).resolves.toBeTruthy();
  });

  it("both bookings belong to the same patient", async () => {
    const a = await book(ar(MON, "10:00"));
    const b = await book(ar(MON, "11:00"));
    expect(a.appointment.patientId).toBe(b.appointment.patientId);
  });
});

describe("deactivated clinic", () => {
  it("takes no online bookings and shows no slots, but the team can still book", async () => {
    const { clinics: clinicsTable } = await import("@/db/schema");
    await db.update(clinicsTable).set({ active: false }).where(eq(clinicsTable.id, f.clinic.id));
    await expect(book(ar(MON, "10:00"))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(findSlots(db, { clinicId: f.clinic.id, specialtyId: f.spec.id, serviceId: f.svc.id }, NOW)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { createAppointment } = await import("@/server/appointments/create");
    await expect(
      createAppointment(db, { professionalId: f.prof.id, locationId: f.locA.id, serviceId: f.svc.id, startsAt: ar(MON, "10:00"), patient: patient(1), consent: false }, { source: "admin", now: NOW }),
    ).resolves.toBeTruthy();
  });
});
