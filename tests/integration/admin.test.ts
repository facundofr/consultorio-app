import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { appointmentEvents, auditLog, users } from "@/db/schema";
import { getAgenda } from "@/server/admin/agenda";
import {
  adminCancelAppointment,
  adminCreateAppointment,
  adminRescheduleAppointment,
  adminSetAppointmentStatus,
  exportAppointmentsCsv,
  getAppointmentDetail,
  listAppointments,
} from "@/server/admin/appointments";
import { deleteLocation, getLocation, listLocations, saveLocation, saveService } from "@/server/admin/catalog";
import { getSettings, saveSettings } from "@/server/admin/clinics";
import { getDashboard, listAudit } from "@/server/admin/dashboard";
import { createException } from "@/server/admin/exceptions";
import { searchPatients, savePatient } from "@/server/admin/patients";
import { deleteProfessional, findRuleOverlap, replaceScheduleRules, saveProfessional } from "@/server/admin/professionals";
import { listUsers, saveUser } from "@/server/admin/users";
import { createAppointment } from "@/server/appointments/create";
import { getAvailableSlots } from "@/server/availability/service";
import type { Actor } from "@/server/auth/rbac";
import { ar, makeFixture, patient, resetDb, testDb, type Fixture } from "./helpers";

const holder = testDb();
const db = holder.db;
afterAll(() => holder.sql.end());

const MON = "2026-11-02";
const NOW = ar("2026-10-26", "08:00");

let f: Fixture;
let other: Fixture;
let superadmin: Actor, admin: Actor, staff: Actor, otherAdmin: Actor;

async function mkUser(role: Actor["role"], clinicId: string | null): Promise<Actor> {
  const id = randomUUID();
  const u = { id, name: `${role} user`, email: `${role}-${id}@x.example`, role, clinicId };
  await db.insert(users).values({ ...u, active: true });
  return u;
}

beforeEach(async () => {
  await resetDb(db);
  f = await makeFixture(db);
  other = await makeFixture(db);
  superadmin = await mkUser("superadmin", null);
  admin = await mkUser("clinic_admin", f.clinic.id);
  staff = await mkUser("staff", f.clinic.id);
  otherAdmin = await mkUser("clinic_admin", other.clinic.id);
});

const bookForm = (startsAt: Date, n = 1) =>
  createAppointment(
    db,
    { professionalId: f.prof.id, locationId: f.locA.id, serviceId: f.svc.id, startsAt, patient: patient(n), consent: true },
    { source: "form", now: NOW },
  );

describe("permissions by role", () => {
  it("staff can read the catalog but not change it", async () => {
    await expect(listLocations(db, staff, f.clinic.id)).resolves.toHaveLength(2);
    await expect(saveLocation(db, staff, f.clinic.id, { name: "X", address: "Y", active: true })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(saveSettings(db, staff, f.clinic.id, {} as never)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listUsers(db, staff)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listAudit(db, staff, f.clinic.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a clinic admin cannot touch another clinic", async () => {
    await expect(listLocations(db, otherAdmin, f.clinic.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getLocation(db, otherAdmin, f.locA.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getSettings(db, otherAdmin, f.clinic.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const appt = await bookForm(ar(MON, "09:00"));
    await expect(adminCancelAppointment(db, otherAdmin, appt.appointment.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getAppointmentDetail(db, otherAdmin, appt.appointment.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("superadmin can work on any clinic", async () => {
    await expect(listLocations(db, superadmin, other.clinic.id)).resolves.toHaveLength(2);
  });

  it("clinic admins cannot create superadmins nor users of other clinics", async () => {
    await expect(
      saveUser(db, admin, { name: "Evil", email: "evil@x.example", role: "superadmin", active: true, password: "0123456789ab" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const id = await saveUser(db, admin, { name: "Nueva", email: "Nueva@X.example", role: "staff", clinicId: other.clinic.id, active: true, password: "0123456789ab" });
    const [u] = await db.select().from(users).where(eq(users.id, id));
    expect(u.clinicId).toBe(f.clinic.id); // forced to the admin's own clinic
    expect(u.email).toBe("nueva@x.example");
    const visible = await listUsers(db, admin);
    expect(visible.every((v) => v.clinicId === f.clinic.id)).toBe(true);
    await expect(
      saveUser(db, admin, { name: "Dup", email: "nueva@x.example", role: "staff", active: true, password: "0123456789ab" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("nobody can demote or deactivate themselves", async () => {
    await expect(saveUser(db, admin, { name: "A", email: admin.email, role: "staff", active: true }, admin.id)).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("catalog and audit", () => {
  it("creates, edits and soft-deletes a location, logging every step", async () => {
    const loc = await saveLocation(db, admin, f.clinic.id, { name: "Sede C", address: "Calle 1", active: true });
    await saveLocation(db, admin, f.clinic.id, { name: "Sede C bis", address: "Calle 1", active: true }, loc.id);
    await deleteLocation(db, admin, loc.id);
    await expect(getLocation(db, admin, loc.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const logs = await db.select().from(auditLog).where(eq(auditLog.entityId, loc.id));
    expect(logs.map((l) => l.action).sort()).toEqual(["create", "delete", "update"]);
    expect(logs.find((l) => l.action === "update")?.data).toEqual({ fields: ["name"] });
  });

  it("refuses to delete a location with future appointments", async () => {
    await createAppointment(
      db,
      { professionalId: f.prof.id, locationId: f.locA.id, serviceId: f.svc.id, startsAt: ar("2027-01-04", "09:00"), patient: patient(1), consent: true },
      { source: "form", now: NOW },
    ).catch(() => null);
    // Book for real in the future relative to the real clock.
    const { slots } = await getAvailableSlots(db, { professionalId: f.prof.id, serviceId: f.svc.id, locationId: f.locA.id, from: new Date(), to: new Date(Date.now() + 14 * 86_400_000) });
    await createAppointment(
      db,
      { professionalId: f.prof.id, locationId: f.locA.id, serviceId: f.svc.id, startsAt: slots[0].startsAt, patient: patient(2), consent: true },
      { source: "form" },
    );
    await expect(deleteLocation(db, admin, f.locA.id)).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(deleteProfessional(db, admin, f.prof.id)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("validates service money input", async () => {
    const s = await saveService(db, admin, f.clinic.id, { name: "Ecografía", durationMinutes: "40" as never, price: "$ 35.000,50", specialtyId: f.spec.id, active: true });
    expect(s.priceCents).toBe(3_500_050);
    await expect(saveService(db, admin, f.clinic.id, { name: "X", durationMinutes: 3 as never, active: true })).rejects.toBeTruthy();
  });
});

describe("professionals and schedules", () => {
  it("rejects overlapping weekly rules", () => {
    const r = (weekday: number, s: string, e: string) => ({ locationId: f.locA.id, weekday, startTime: s, endTime: e, validFrom: null, validTo: null });
    expect(findRuleOverlap([r(1, "09:00", "12:00"), r(1, "11:00", "13:00")])).toMatch(/superponen/);
    expect(findRuleOverlap([r(1, "09:00", "12:00"), r(1, "12:00", "13:00")])).toBeNull();
    expect(findRuleOverlap([r(7, "22:00", "02:00"), r(1, "01:00", "03:00")])).toMatch(/superponen/);
    expect(findRuleOverlap([r(1, "09:00", "12:00"), { ...r(1, "09:00", "12:00"), validFrom: "2027-01-01" }, ])).toMatch(/superponen/);
    expect(findRuleOverlap([{ ...r(1, "09:00", "12:00"), validTo: "2026-12-31" }, { ...r(1, "09:00", "12:00"), validFrom: "2027-01-01" }])).toBeNull();
  });

  it("replaces the weekly grid and availability follows", async () => {
    await replaceScheduleRules(db, admin, f.prof.id, [{ locationId: f.locA.id, weekday: 1, startTime: "14:00", endTime: "15:00" }]);
    const r = await getAvailableSlots(db, { professionalId: f.prof.id, serviceId: f.svc.id, from: ar(MON, "00:00"), to: ar("2026-11-03", "00:00") }, NOW);
    expect(r.slots.map((s) => s.localTime)).toEqual(["14:00", "14:30"]);
  });

  it("rejects rules at a location the professional does not attend", async () => {
    await expect(
      replaceScheduleRules(db, admin, f.prof.id, [{ locationId: other.locA.id, weekday: 1, startTime: "09:00", endTime: "10:00" }]),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("creates a professional with specialties and locations of the same clinic only", async () => {
    await expect(
      saveProfessional(db, admin, f.clinic.id, { firstName: "Juan", lastName: "Pérez", active: true, specialtyIds: [other.spec.id], locationIds: [f.locA.id] }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const id = await saveProfessional(db, admin, f.clinic.id, { firstName: "Juan", lastName: "Pérez", active: true, specialtyIds: [f.spec.id], locationIds: [f.locA.id] });
    expect(id).toBeTruthy();
  });
});

describe("exceptions", () => {
  it("a holiday removes availability and reports affected appointments", async () => {
    await bookForm(ar(MON, "09:00"));
    const res = await createException(db, admin, f.clinic.id, { scope: "clinic", kind: "block", startDate: MON, endDate: MON, allDay: true, reason: "Feriado" });
    expect(res.affectedAppointments).toBe(1);
    const r = await getAvailableSlots(db, { professionalId: f.prof.id, serviceId: f.svc.id, from: ar(MON, "00:00"), to: ar("2026-11-03", "00:00") }, NOW);
    expect(r.slots).toEqual([]);
  });

  it("extra hours require a professional and a location", async () => {
    await expect(
      createException(db, admin, f.clinic.id, { scope: "clinic", kind: "extra", startDate: MON, endDate: MON, startTime: "14:00", endTime: "15:00" }),
    ).rejects.toBeTruthy();
    await createException(db, admin, f.clinic.id, {
      scope: "professional", kind: "extra", professionalId: f.prof.id, locationId: f.locA.id, startDate: "2026-11-07", endDate: "2026-11-07", startTime: "10:00", endTime: "11:00",
    });
    const r = await getAvailableSlots(db, { professionalId: f.prof.id, serviceId: f.svc.id, from: ar("2026-11-07", "00:00"), to: ar("2026-11-08", "00:00") }, NOW);
    expect(r.slots.map((s) => s.localTime)).toEqual(["10:00", "10:30"]);
  });
});

describe("admin appointment operations", () => {
  it("books manually for an existing patient, moves, marks and cancels", async () => {
    const pid = await savePatient(db, staff, f.clinic.id, { fullName: "Carla Gómez", phone: "11 4444-5555", email: "" });
    const created = await adminCreateAppointment(db, staff, f.clinic.id, {
      professionalId: f.prof.id, locationId: f.locA.id, serviceId: f.svc.id, startsAt: ar(MON, "10:00"), patientId: pid, consent: false,
    });
    expect(created.appointment.source).toBe("admin");
    expect(created.appointment.createdByUserId).toBe(staff.id);

    // Move by 15' overlapping its own old time: allowed (it excludes itself).
    const moved = await adminRescheduleAppointment(db, staff, created.appointment.id, { startsAt: ar(MON, "10:30") });
    expect(moved.startsAt.toISOString()).toBe(ar(MON, "10:30").toISOString());

    // Cannot move onto another appointment.
    await bookForm(ar(MON, "11:30"), 2);
    await expect(adminRescheduleAppointment(db, staff, created.appointment.id, { startsAt: ar(MON, "11:30") })).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
    await expect(adminRescheduleAppointment(db, staff, created.appointment.id, { startsAt: ar(MON, "11:30"), force: true })).rejects.toMatchObject({ code: "SLOT_TAKEN" });

    // Move to the other location (Tuesday afternoon).
    const toB = await adminRescheduleAppointment(db, staff, created.appointment.id, { startsAt: ar("2026-11-03", "15:00"), locationId: f.locB.id });
    expect(toB.locationId).toBe(f.locB.id);

    await adminSetAppointmentStatus(db, staff, created.appointment.id, "no_show");
    await adminSetAppointmentStatus(db, staff, created.appointment.id, "confirmed");
    await adminCancelAppointment(db, staff, created.appointment.id, "Pedido telefónico");
    await expect(adminCancelAppointment(db, staff, created.appointment.id)).rejects.toMatchObject({ code: "ALREADY_CANCELLED" });
    await expect(adminSetAppointmentStatus(db, staff, created.appointment.id, "completed")).rejects.toMatchObject({ code: "VALIDATION" });

    const events = await db.select().from(appointmentEvents).where(eq(appointmentEvents.appointmentId, created.appointment.id));
    expect(events.map((e) => e.type).sort()).toEqual(["cancelled", "created", "rescheduled", "rescheduled", "status_changed", "status_changed"]);

    const detail = await getAppointmentDetail(db, staff, created.appointment.id);
    expect(detail.status).toBe("cancelled_by_admin");
    expect(detail.patientPhone).toBe("1144445555");
    expect(detail.cancelReason).toBe("Pedido telefónico");
  });

  it("admins may force a booking outside the grid but never on top of another", async () => {
    await expect(
      adminCreateAppointment(db, admin, f.clinic.id, { professionalId: f.prof.id, locationId: f.locA.id, serviceId: f.svc.id, startsAt: ar(MON, "19:00"), patient: patient(5), consent: false }),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
    const forced = await adminCreateAppointment(
      db, admin, f.clinic.id,
      { professionalId: f.prof.id, locationId: f.locA.id, serviceId: f.svc.id, startsAt: ar(MON, "19:00"), patient: patient(5), consent: false },
      { force: true },
    );
    expect(forced.appointment.status).toBe("confirmed");
  });

  it("an admin cannot book with a professional of another clinic", async () => {
    await expect(
      adminCreateAppointment(db, admin, f.clinic.id, { professionalId: other.prof.id, locationId: other.locA.id, serviceId: other.svc.id, startsAt: ar(MON, "09:00"), patient: patient(1), consent: false }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lists with filters and exports a safe CSV", async () => {
    await bookForm(ar(MON, "09:00"), 1);
    const b = await bookForm(ar(MON, "09:30"), 2);
    await savePatient(db, staff, f.clinic.id, { fullName: "=HYPERLINK(\"x\")", phone: "11 3333-2222", email: "" });
    await adminCancelAppointment(db, staff, b.appointment.id);
    const all = await listAppointments(db, staff, f.clinic.id, { from: MON, to: MON });
    expect(all.total).toBe(2);
    const cancelled = await listAppointments(db, staff, f.clinic.id, { status: "cancelled_by_admin" });
    expect(cancelled.rows.map((r) => r.code)).toEqual([b.appointment.code]);
    const byCode = await listAppointments(db, staff, f.clinic.id, { q: b.appointment.code.toLowerCase() });
    expect(byCode.total).toBe(1);
    const byName = await listAppointments(db, staff, f.clinic.id, { q: "prueba 1" });
    expect(byName.total).toBe(1);

    const csv = await exportAppointmentsCsv(db, admin, f.clinic.id, { from: MON, to: MON });
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toContain("Código;Fecha;Hora");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain(";2026-11-02;09:00;09:30;Confirmado;Formulario;Paciente Prueba 1;1155551001;paciente1@example.com;");
  });

  it("neutralizes spreadsheet formulas in exported values", async () => {
    await createAppointment(
      db,
      { professionalId: f.prof.id, locationId: f.locA.id, serviceId: f.svc.id, startsAt: ar(MON, "09:00"), patient: { ...patient(1), fullName: "=CMD Evil" }, consent: true },
      { source: "form", now: NOW },
    );
    const csv = await exportAppointmentsCsv(db, admin, f.clinic.id, {});
    expect(csv).toContain(";'=CMD Evil;");
  });

  it("front desk cannot export, and the audit log never keeps the search text", async () => {
    await expect(exportAppointmentsCsv(db, staff, f.clinic.id, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await exportAppointmentsCsv(db, admin, f.clinic.id, { q: "1155551001" });
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, "export"));
    expect(JSON.stringify(entry.data)).not.toContain("1155551001");
    expect(entry.data).toMatchObject({ filters: { search: true } });
  });
});

describe("patients search", () => {
  it("finds by partial name, exact phone (any format), email and appointment code", async () => {
    const a = await bookForm(ar(MON, "09:00"), 7);
    expect((await searchPatients(db, staff, f.clinic.id, { q: "prueba 7" })).rows).toHaveLength(1);
    expect((await searchPatients(db, staff, f.clinic.id, { q: "011 15 5555-1007" })).rows).toHaveLength(1);
    expect((await searchPatients(db, staff, f.clinic.id, { q: "+54 9 11 5555 1007" })).mode).toBe("phone");
    expect((await searchPatients(db, staff, f.clinic.id, { q: "PACIENTE7@example.com" })).rows).toHaveLength(1);
    expect((await searchPatients(db, staff, f.clinic.id, { q: a.appointment.code })).rows).toHaveLength(1);
    expect((await searchPatients(db, staff, f.clinic.id, { q: "5555" })).rows).toHaveLength(0); // partial phone: no match by design
    await expect(searchPatients(db, otherAdmin, f.clinic.id, { q: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("agenda and dashboard", () => {
  it("builds a weekly agenda for a professional and a daily one for a location", async () => {
    await bookForm(ar(MON, "09:00"));
    const week = await getAgenda(db, staff, f.clinic.id, { view: "week", mode: "professional", date: "2026-11-04", subjectId: f.prof.id });
    expect(week.days[0]).toBe(MON);
    expect(week.columns).toHaveLength(7);
    expect(week.columns[0].appointments).toHaveLength(1);
    expect(week.columns[0].open).toHaveLength(1);
    expect(week.columns[1].open).toHaveLength(2); // Tue: Sede A morning + Sede B afternoon
    expect(week.columns[5].open).toHaveLength(0); // Saturday

    const day = await getAgenda(db, staff, f.clinic.id, { view: "day", mode: "location", date: MON, subjectId: f.locA.id });
    expect(day.columns.map((c) => c.professionalId)).toEqual([f.prof.id]);
    expect(day.columns[0].appointments).toHaveLength(1);
  });

  it("dashboard counts sources and occupancy", async () => {
    const d = await getDashboard(db, admin, f.clinic.id, ar(MON, "08:00"));
    expect(d.today).toBe(MON);
    expect(d.occupancy.today.openMinutes).toBe(240);
    await createAppointment(
      db,
      { professionalId: f.prof.id, locationId: f.locA.id, serviceId: f.svc.id, startsAt: ar(MON, "09:00"), patient: patient(1), consent: true },
      { source: "ai", now: ar(MON, "07:00") },
    );
    const d2 = await getDashboard(db, admin, f.clinic.id, ar(MON, "08:00"));
    expect(d2.occupancy.today.bookedMinutes).toBe(30);
    expect(d2.todayAppointments).toHaveLength(1);
    expect(d2.bySource.ai).toBe(1);
  });
});
