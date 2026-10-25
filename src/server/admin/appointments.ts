import { and, asc, count, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import {
  appointmentEvents,
  appointments,
  appointmentSource,
  appointmentStatus,
  locations,
  patients,
  professionals,
  services,
  specialties,
  users,
} from "@/db/schema";
import { normalizeAppointmentCode } from "@/lib/codes";
import { decrypt, normalizeName } from "@/lib/pii";
import { addDays, formatDateTime, localToUtc, utcToLocal } from "@/lib/time";
import { createAppointment, type CreateAppointmentInput } from "@/server/appointments/create";
import { cancelAppointment, rescheduleAppointment, setAppointmentStatus, type RescheduleInput } from "@/server/appointments/manage";
import { assertCan, type Actor } from "@/server/auth/rbac";
import { getClinicContext } from "@/server/clinics/settings";
import { DomainError } from "@/server/errors";
import { audit } from "./audit";
import { likePattern, pageParams } from "./common";
import { professionalDisplayName } from "./professionals";

export const STATUS_LABELS: Record<(typeof appointmentStatus.enumValues)[number], string> = {
  confirmed: "Confirmado",
  cancelled_by_patient: "Cancelado por paciente",
  cancelled_by_admin: "Cancelado por la clínica",
  completed: "Atendido",
  no_show: "Ausente",
};

export const SOURCE_LABELS: Record<(typeof appointmentSource.enumValues)[number], string> = {
  ai: "Asistente IA",
  form: "Formulario",
  admin: "Panel",
};

const optDate = z
  .string()
  .optional()
  .transform((v) => v || undefined)
  .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional());
const optId = z
  .string()
  .optional()
  .transform((v) => v || undefined)
  .pipe(z.string().uuid().optional());

export const AppointmentFilters = z.object({
  from: optDate,
  to: optDate,
  professionalId: optId,
  locationId: optId,
  status: z
    .string()
    .optional()
    .transform((v) => v || undefined)
    .pipe(z.enum(appointmentStatus.enumValues).optional()),
  source: z
    .string()
    .optional()
    .transform((v) => v || undefined)
    .pipe(z.enum(appointmentSource.enumValues).optional()),
  q: z.string().trim().max(100).optional(),
});
export type AppointmentFilters = z.input<typeof AppointmentFilters>;

async function buildWhere(db: Db, clinicId: string, raw: AppointmentFilters) {
  const f = AppointmentFilters.parse(raw);
  const { clinic } = await getClinicContext(db, clinicId);
  const conds: SQL[] = [eq(appointments.clinicId, clinicId)];
  if (f.from) conds.push(gte(appointments.startsAt, localToUtc(f.from, 0, clinic.timezone)));
  if (f.to) conds.push(lt(appointments.startsAt, localToUtc(addDays(f.to, 1), 0, clinic.timezone)));
  if (f.professionalId) conds.push(eq(appointments.professionalId, f.professionalId));
  if (f.locationId) conds.push(eq(appointments.locationId, f.locationId));
  if (f.status) conds.push(eq(appointments.status, f.status));
  if (f.source) conds.push(eq(appointments.source, f.source));
  if (f.q) {
    const code = normalizeAppointmentCode(f.q);
    if (code && /^t-?/i.test(f.q)) conds.push(eq(appointments.code, code));
    else conds.push(sql`${patients.nameKey} ilike ${likePattern(normalizeName(f.q))}`);
  }
  return { where: and(...conds), tz: clinic.timezone };
}

function baseSelect(db: Db) {
  return db
    .select({
      id: appointments.id,
      code: appointments.code,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      status: appointments.status,
      source: appointments.source,
      notes: appointments.notes,
      createdAt: appointments.createdAt,
      patientId: patients.id,
      patientName: patients.fullName,
      patientPhoneLast4: patients.phoneLast4,
      professionalId: professionals.id,
      professionalTitle: professionals.title,
      professionalFirst: professionals.firstName,
      professionalLast: professionals.lastName,
      locationId: locations.id,
      locationName: locations.name,
      serviceId: services.id,
      serviceName: services.name,
      specialtyName: specialties.name,
    })
    .from(appointments)
    .innerJoin(patients, eq(patients.id, appointments.patientId))
    .innerJoin(professionals, eq(professionals.id, appointments.professionalId))
    .innerJoin(locations, eq(locations.id, appointments.locationId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .leftJoin(specialties, eq(specialties.id, appointments.specialtyId));
}

export type AppointmentListRow = Awaited<ReturnType<typeof listAppointments>>["rows"][number];

export async function listAppointments(db: Db, actor: Actor, clinicId: string, filters: AppointmentFilters, page = 1) {
  assertCan(actor, "read", "appointments", clinicId);
  const { where, tz } = await buildWhere(db, clinicId, filters);
  const { limit, offset } = pageParams(page);
  const [{ total }] = await db
    .select({ total: count() })
    .from(appointments)
    .innerJoin(patients, eq(patients.id, appointments.patientId))
    .where(where);
  const rows = await baseSelect(db).where(where).orderBy(asc(appointments.startsAt)).limit(limit).offset(offset);
  return {
    total,
    timezone: tz,
    rows: rows.map((r) => ({
      ...r,
      professionalName: professionalDisplayName({ title: r.professionalTitle, firstName: r.professionalFirst, lastName: r.professionalLast }),
    })),
  };
}

/* ---------------------------------- CSV ----------------------------------- */

function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  // Neutralize spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV (semicolon separated, UTF-8 BOM: opens correctly in Excel es-AR). */
export async function exportAppointmentsCsv(db: Db, actor: Actor, clinicId: string, filters: AppointmentFilters) {
  assertCan(actor, "read", "exports", clinicId);
  const { where, tz } = await buildWhere(db, clinicId, filters);
  const data = await db
    .select({
      code: appointments.code,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      status: appointments.status,
      source: appointments.source,
      patientName: patients.fullName,
      phoneEnc: patients.phoneEnc,
      emailEnc: patients.emailEnc,
      professionalTitle: professionals.title,
      professionalFirst: professionals.firstName,
      professionalLast: professionals.lastName,
      locationName: locations.name,
      serviceName: services.name,
      specialtyName: specialties.name,
    })
    .from(appointments)
    .innerJoin(patients, eq(patients.id, appointments.patientId))
    .innerJoin(professionals, eq(professionals.id, appointments.professionalId))
    .innerJoin(locations, eq(locations.id, appointments.locationId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .leftJoin(specialties, eq(specialties.id, appointments.specialtyId))
    .where(where)
    .orderBy(asc(appointments.startsAt))
    .limit(20_000);

  const header = ["Código", "Fecha", "Hora", "Fin", "Estado", "Origen", "Paciente", "Teléfono", "Email", "Profesional", "Especialidad", "Consulta", "Sede"];
  const lines = data.map((r) => {
    const s = utcToLocal(r.startsAt, tz);
    const e = utcToLocal(r.endsAt, tz);
    return [
      r.code,
      s.date,
      s.time,
      e.time,
      STATUS_LABELS[r.status],
      SOURCE_LABELS[r.source],
      r.patientName,
      decrypt(r.phoneEnc),
      r.emailEnc ? decrypt(r.emailEnc) : "",
      professionalDisplayName({ title: r.professionalTitle, firstName: r.professionalFirst, lastName: r.professionalLast }),
      r.specialtyName ?? "",
      r.serviceName,
      r.locationName,
    ]
      .map(csvCell)
      .join(";");
  });
  await audit(db, actor, { action: "export", entity: "appointments", clinicId, data: { rows: data.length, filters: auditableFilters(filters) } });
  return "﻿" + [header.join(";"), ...lines].join("\r\n") + "\r\n";
}

/* --------------------------------- Detail --------------------------------- */

export async function getAppointmentDetail(db: Db, actor: Actor, id: string) {
  const [row] = await baseSelect(db).where(eq(appointments.id, id));
  if (!row) throw new DomainError("NOT_FOUND", "No encontramos ese turno.");
  const [appt] = await db.select({ clinicId: appointments.clinicId, cancelReason: appointments.cancelReason }).from(appointments).where(eq(appointments.id, id));
  assertCan(actor, "read", "appointments", appt.clinicId);
  const [p] = await db.select().from(patients).where(eq(patients.id, row.patientId));
  const events = await db
    .select({ id: appointmentEvents.id, type: appointmentEvents.type, actor: appointmentEvents.actor, data: appointmentEvents.data, createdAt: appointmentEvents.createdAt, userName: users.name })
    .from(appointmentEvents)
    .leftJoin(users, eq(users.id, appointmentEvents.actorUserId))
    .where(eq(appointmentEvents.appointmentId, id))
    .orderBy(desc(appointmentEvents.createdAt));
  const { clinic } = await getClinicContext(db, appt.clinicId);
  return {
    ...row,
    clinicId: appt.clinicId,
    cancelReason: appt.cancelReason,
    timezone: clinic.timezone,
    when: formatDateTime(row.startsAt, clinic.timezone),
    professionalName: professionalDisplayName({ title: row.professionalTitle, firstName: row.professionalFirst, lastName: row.professionalLast }),
    patientPhone: decrypt(p.phoneEnc),
    patientEmail: p.emailEnc ? decrypt(p.emailEnc) : null,
    events,
  };
}

/**
 * Export filters for the audit log: ids and dates only. The free-text search
 * can hold a patient's name, phone or email, so only its presence is logged.
 */
function auditableFilters(raw: AppointmentFilters) {
  const { q, ...rest } = AppointmentFilters.parse(raw);
  return { ...rest, search: !!q };
}

/* ------------------------------ Admin actions ----------------------------- */

async function clinicOf(db: Db, id: string) {
  const [a] = await db.select({ clinicId: appointments.clinicId }).from(appointments).where(eq(appointments.id, id));
  if (!a) throw new DomainError("NOT_FOUND", "No encontramos ese turno.");
  return a.clinicId;
}

export async function adminCreateAppointment(
  db: Db,
  actor: Actor,
  clinicId: string,
  input: CreateAppointmentInput,
  opts: { force?: boolean } = {},
) {
  assertCan(actor, "write", "appointments", clinicId);
  const [prof] = await db.select({ clinicId: professionals.clinicId }).from(professionals).where(eq(professionals.id, input.professionalId));
  if (!prof || prof.clinicId !== clinicId) throw new DomainError("FORBIDDEN", "Ese profesional no pertenece a la clínica.");
  const created = await createAppointment(db, { ...input, consent: input.consent ?? false }, {
    source: "admin",
    actorUserId: actor.id,
    allowOutsideGrid: opts.force,
  });
  await audit(db, actor, { action: "create", entity: "appointment", entityId: created.appointment.id, clinicId, data: { forced: !!opts.force } });
  return created;
}

export async function adminCancelAppointment(db: Db, actor: Actor, id: string, reason?: string | null) {
  const clinicId = await clinicOf(db, id);
  assertCan(actor, "write", "appointments", clinicId);
  const row = await cancelAppointment(db, id, { kind: "admin", userId: actor.id, reason: reason?.slice(0, 300) || null });
  await audit(db, actor, { action: "cancel", entity: "appointment", entityId: id, clinicId });
  return row;
}

export async function adminRescheduleAppointment(db: Db, actor: Actor, id: string, input: RescheduleInput) {
  const clinicId = await clinicOf(db, id);
  assertCan(actor, "write", "appointments", clinicId);
  const row = await rescheduleAppointment(db, id, input, { userId: actor.id });
  await audit(db, actor, { action: "move", entity: "appointment", entityId: id, clinicId, data: { forced: !!input.force } });
  return row;
}

export async function adminSetAppointmentStatus(db: Db, actor: Actor, id: string, status: "confirmed" | "completed" | "no_show") {
  const clinicId = await clinicOf(db, id);
  assertCan(actor, "write", "appointments", clinicId);
  const row = await setAppointmentStatus(db, id, status, { userId: actor.id });
  await audit(db, actor, { action: "status", entity: "appointment", entityId: id, clinicId, data: { status } });
  return row;
}
