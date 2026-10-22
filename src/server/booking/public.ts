/**
 * Patient-facing booking layer. The booking form and the AI assistant both go
 * through these functions (and only these), so the rules are identical:
 * only active entities, real availability, server-side revalidation.
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import {
  appointments,
  clinics,
  kbDocs,
  locations,
  patients,
  professionalLocations,
  professionals,
  professionalSpecialties,
  services,
  settings,
  specialties,
} from "@/db/schema";
import { normalizeAppointmentCode, tokenMatches } from "@/lib/codes";
import { blindIndex, normalizeEmail, normalizePhone } from "@/lib/pii";
import { addDays, formatDateTime, localToUtc, utcToLocal } from "@/lib/time";
import { createAppointment } from "@/server/appointments/create";
import { cancelAppointment, checkPatientCancellation } from "@/server/appointments/manage";
import { getAvailableSlots } from "@/server/availability/service";
import { getClinicContext } from "@/server/clinics/settings";
import { DomainError } from "@/server/errors";
import { PatientInput } from "@/server/patients/service";

const DAY = 86_400_000;

export const professionalName = (p: { title: string | null; firstName: string; lastName: string }) =>
  [p.title, p.firstName, p.lastName].filter(Boolean).join(" ");

/* -------------------------------- Catalog --------------------------------- */

export async function listClinicsPublic(db: Db) {
  return db
    .select({ id: clinics.id, slug: clinics.slug, name: clinics.name, phone: clinics.phone })
    .from(clinics)
    .where(and(eq(clinics.active, true), isNull(clinics.deletedAt)))
    .orderBy(asc(clinics.name));
}

export async function getClinicPublic(db: Db, idOrSlug: string) {
  const isUuid = z.string().uuid().safeParse(idOrSlug).success;
  const [c] = await db
    .select()
    .from(clinics)
    .where(and(isUuid ? eq(clinics.id, idOrSlug) : eq(clinics.slug, idOrSlug), eq(clinics.active, true), isNull(clinics.deletedAt)));
  if (!c) throw new DomainError("NOT_FOUND", "No encontramos esa clínica.");
  return c;
}

export async function listLocationsPublic(db: Db, clinicId: string) {
  return db
    .select({ id: locations.id, name: locations.name, address: locations.address, city: locations.city, phone: locations.phone, notes: locations.notes })
    .from(locations)
    .where(and(eq(locations.clinicId, clinicId), eq(locations.active, true), isNull(locations.deletedAt)))
    .orderBy(asc(locations.name));
}

/** Active professionals of a clinic with their specialty and location ids. */
async function activeProfessionals(db: Db, clinicId: string) {
  const profs = await db
    .select()
    .from(professionals)
    .where(and(eq(professionals.clinicId, clinicId), eq(professionals.active, true), isNull(professionals.deletedAt)))
    .orderBy(asc(professionals.lastName), asc(professionals.firstName));
  if (!profs.length) return [];
  const ids = profs.map((p) => p.id);
  const [specs, locs] = await Promise.all([
    db
      .select({ pid: professionalSpecialties.professionalId, id: specialties.id })
      .from(professionalSpecialties)
      .innerJoin(specialties, eq(specialties.id, professionalSpecialties.specialtyId))
      .where(and(inArray(professionalSpecialties.professionalId, ids), eq(specialties.active, true), isNull(specialties.deletedAt))),
    db
      .select({ pid: professionalLocations.professionalId, id: locations.id })
      .from(professionalLocations)
      .innerJoin(locations, eq(locations.id, professionalLocations.locationId))
      .where(and(inArray(professionalLocations.professionalId, ids), eq(locations.active, true), isNull(locations.deletedAt))),
  ]);
  return profs.map((p) => ({
    id: p.id,
    name: professionalName(p),
    bio: p.bio,
    specialtyIds: specs.filter((s) => s.pid === p.id).map((s) => s.id),
    locationIds: locs.filter((l) => l.pid === p.id).map((l) => l.id),
  }));
}

/** Specialties that someone actually practices (at the location, if given). */
export async function listSpecialtiesPublic(db: Db, clinicId: string, locationId?: string | null) {
  const [specs, profs] = await Promise.all([
    db
      .select({ id: specialties.id, name: specialties.name, slug: specialties.slug, description: specialties.description })
      .from(specialties)
      .where(and(eq(specialties.clinicId, clinicId), eq(specialties.active, true), isNull(specialties.deletedAt)))
      .orderBy(asc(specialties.name)),
    activeProfessionals(db, clinicId),
  ]);
  const offered = new Set(
    profs.filter((p) => !locationId || p.locationIds.includes(locationId)).flatMap((p) => (p.locationIds.length ? p.specialtyIds : [])),
  );
  return specs.filter((s) => offered.has(s.id));
}

export async function listProfessionalsPublic(db: Db, clinicId: string, specialtyId: string, locationId?: string | null) {
  const profs = await activeProfessionals(db, clinicId);
  return profs.filter(
    (p) => p.specialtyIds.includes(specialtyId) && p.locationIds.length > 0 && (!locationId || p.locationIds.includes(locationId)),
  );
}

export async function listServicesPublic(db: Db, clinicId: string, specialtyId: string) {
  const rows = await db
    .select({ id: services.id, name: services.name, description: services.description, durationMinutes: services.durationMinutes, priceCents: services.priceCents, specialtyId: services.specialtyId })
    .from(services)
    .where(and(eq(services.clinicId, clinicId), eq(services.active, true), isNull(services.deletedAt)))
    .orderBy(asc(services.durationMinutes), asc(services.name));
  return rows.filter((s) => !s.specialtyId || s.specialtyId === specialtyId);
}

/** Public clinic information (contact, locations, FAQ). */
export async function getClinicInfo(db: Db, clinicId: string) {
  const { clinic, settings: st } = await getClinicContext(db, clinicId);
  const [locs, faq] = await Promise.all([
    listLocationsPublic(db, clinicId),
    db
      .select({ id: kbDocs.id, question: kbDocs.question, answer: kbDocs.answer, tags: kbDocs.tags })
      .from(kbDocs)
      .where(and(eq(kbDocs.clinicId, clinicId), eq(kbDocs.active, true), isNull(kbDocs.deletedAt)))
      .orderBy(asc(kbDocs.question)),
  ]);
  return {
    id: clinic.id,
    name: clinic.name,
    timezone: clinic.timezone,
    phone: st.contactPhone ?? clinic.phone,
    email: st.contactEmail ?? clinic.email,
    hours: st.contactHours,
    website: clinic.website,
    cancelMinHours: st.cancelMinHours,
    bookingHorizonDays: st.bookingHorizonDays,
    welcomeText: st.welcomeText,
    assistantTone: st.assistantTone,
    emergencyMessage: st.emergencyMessage,
    locations: locs,
    faq,
  };
}

/* ------------------------------ Availability ------------------------------ */

export type PublicSlot = {
  startsAt: string;
  endsAt: string;
  localDate: string;
  localTime: string;
  locationId: string;
  professionalId: string;
};

export const SlotQuery = z.object({
  clinicId: z.string().uuid(),
  specialtyId: z.string().uuid(),
  serviceId: z.string().uuid(),
  /** null/undefined = "el primero disponible" among the specialty's professionals. */
  professionalId: z.string().uuid().nullish(),
  locationId: z.string().uuid().nullish(),
  /** Local dates (inclusive). Defaults: today … horizon. */
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type SlotQuery = z.input<typeof SlotQuery>;

/**
 * Real slots for the patient (lead time and horizon applied).
 * With no professional, merges all professionals of the specialty.
 */
export async function findSlots(db: Db, raw: SlotQuery, now: Date = new Date()): Promise<{ timezone: string; slots: PublicSlot[] }> {
  const q = SlotQuery.parse(raw);
  const { clinic, settings: st } = await getClinicContext(db, q.clinicId);
  const tz = clinic.timezone;
  const today = utcToLocal(now, tz).date;
  const fromDate = q.fromDate && q.fromDate > today ? q.fromDate : today;
  const lastDate = utcToLocal(new Date(now.getTime() + st.bookingHorizonDays * DAY), tz).date;
  const toDate = q.toDate && q.toDate < lastDate ? q.toDate : lastDate;
  if (toDate < fromDate) return { timezone: tz, slots: [] };

  const svcs = await listServicesPublic(db, q.clinicId, q.specialtyId);
  if (!svcs.some((s) => s.id === q.serviceId)) throw new DomainError("VALIDATION", "Ese tipo de consulta no corresponde a la especialidad.");

  const candidates = await listProfessionalsPublic(db, q.clinicId, q.specialtyId, q.locationId);
  const profs = q.professionalId ? candidates.filter((p) => p.id === q.professionalId) : candidates;
  if (q.professionalId && profs.length === 0) throw new DomainError("NOT_FOUND", "Ese profesional no atiende esa especialidad acá.");

  const from = localToUtc(fromDate, 0, tz);
  const to = localToUtc(addDays(toDate, 1), 0, tz);
  const all: PublicSlot[] = [];
  for (const p of profs) {
    const r = await getAvailableSlots(db, { professionalId: p.id, serviceId: q.serviceId, locationId: q.locationId ?? null, from, to }, now);
    for (const s of r.slots) {
      all.push({
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
        localDate: s.localDate,
        localTime: s.localTime,
        locationId: s.locationId,
        professionalId: p.id,
      });
    }
  }
  all.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.professionalId.localeCompare(b.professionalId));
  return { timezone: tz, slots: all };
}

/** Local dates (YYYY-MM-DD) that have at least one slot. */
export async function availableDays(db: Db, q: SlotQuery, now: Date = new Date()) {
  const { timezone, slots } = await findSlots(db, q, now);
  return { timezone, days: [...new Set(slots.map((s) => s.localDate))] };
}

/* -------------------------------- Booking --------------------------------- */

export const PublicBookingInput = z.object({
  professionalId: z.string().uuid(),
  locationId: z.string().uuid(),
  serviceId: z.string().uuid(),
  startsAt: z.coerce.date(),
  patient: PatientInput,
  consent: z.literal(true, { message: "Necesitamos tu consentimiento para guardar tus datos y reservar el turno." }),
});
export type PublicBookingInput = z.input<typeof PublicBookingInput>;

export async function bookPublic(
  db: Db,
  raw: PublicBookingInput,
  opts: { source: "form" | "ai"; conversationId?: string | null; now?: Date },
) {
  const input = PublicBookingInput.parse(raw);
  const created = await createAppointment(db, { ...input, consent: true }, { source: opts.source, conversationId: opts.conversationId, now: opts.now });
  return created;
}

/* ------------------------- Lookup & cancellation -------------------------- */

export type SecondFactor = { token?: string | null; phone?: string | null; email?: string | null };

export type PublicAppointmentView = {
  id: string;
  code: string;
  status: (typeof appointments.status.enumValues)[number];
  startsAt: Date;
  endsAt: Date;
  when: string;
  timezone: string;
  clinic: { id: string; name: string; phone: string | null; email: string | null };
  professionalName: string;
  specialtyName: string | null;
  serviceName: string;
  location: { name: string; address: string; city: string | null; notes: string | null };
  patientFirstName: string;
  cancel: { allowed: boolean; reason?: "ALREADY_CANCELLED" | "NOT_CANCELLABLE" | "CANCEL_WINDOW_PASSED"; deadline: Date; minHours: number };
};

const NOT_FOUND_MSG = "No encontramos un turno con esos datos. Revisá el código y el teléfono o email.";

/**
 * Look up an appointment by code plus a second factor (cancel token, or the
 * patient's phone or email). Always the same error, so codes can't be probed.
 */
export async function findAppointmentPublic(db: Db, codeInput: string, factor: SecondFactor, now: Date = new Date()): Promise<PublicAppointmentView> {
  const code = normalizeAppointmentCode(codeInput);
  if (!code) throw new DomainError("NOT_FOUND", NOT_FOUND_MSG);
  const [row] = await db
    .select({
      a: appointments,
      phoneHash: patients.phoneHash,
      emailHash: patients.emailHash,
      fullName: patients.fullName,
      pTitle: professionals.title,
      pFirst: professionals.firstName,
      pLast: professionals.lastName,
      serviceName: services.name,
      specialtyName: specialties.name,
      locName: locations.name,
      locAddress: locations.address,
      locCity: locations.city,
      locNotes: locations.notes,
      clinicName: clinics.name,
      clinicPhone: clinics.phone,
      clinicEmail: clinics.email,
      tz: clinics.timezone,
      cancelMinHours: settings.cancelMinHours,
      contactPhone: settings.contactPhone,
      contactEmail: settings.contactEmail,
    })
    .from(appointments)
    .innerJoin(patients, eq(patients.id, appointments.patientId))
    .innerJoin(professionals, eq(professionals.id, appointments.professionalId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .leftJoin(specialties, eq(specialties.id, appointments.specialtyId))
    .innerJoin(locations, eq(locations.id, appointments.locationId))
    .innerJoin(clinics, eq(clinics.id, appointments.clinicId))
    .leftJoin(settings, eq(settings.clinicId, appointments.clinicId))
    .where(eq(appointments.code, code));
  if (!row) throw new DomainError("NOT_FOUND", NOT_FOUND_MSG);

  const ok =
    (!!factor.token && tokenMatches(factor.token, row.a.cancelTokenHash)) ||
    (!!factor.phone && normalizePhone(factor.phone).length >= 8 && blindIndex("phone", normalizePhone(factor.phone)) === row.phoneHash) ||
    (!!factor.email && !!row.emailHash && blindIndex("email", normalizeEmail(factor.email)) === row.emailHash);
  if (!ok) throw new DomainError("NOT_FOUND", NOT_FOUND_MSG);

  const minHours = row.cancelMinHours ?? 24;
  const check = checkPatientCancellation(row.a, minHours, now);
  return {
    id: row.a.id,
    code: row.a.code,
    status: row.a.status,
    startsAt: row.a.startsAt,
    endsAt: row.a.endsAt,
    when: formatDateTime(row.a.startsAt, row.tz),
    timezone: row.tz,
    clinic: { id: row.a.clinicId, name: row.clinicName, phone: row.contactPhone ?? row.clinicPhone, email: row.contactEmail ?? row.clinicEmail },
    professionalName: professionalName({ title: row.pTitle, firstName: row.pFirst, lastName: row.pLast }),
    specialtyName: row.specialtyName,
    serviceName: row.serviceName,
    location: { name: row.locName, address: row.locAddress, city: row.locCity, notes: row.locNotes },
    patientFirstName: row.fullName.split(" ")[0] ?? row.fullName,
    cancel: check.ok ? { allowed: true, deadline: check.deadline, minHours } : { allowed: false, reason: check.reason, deadline: check.deadline, minHours },
  };
}

/** Patient cancellation: verify the second factor, then apply the window rule inside the transaction. */
export async function cancelPublic(
  db: Db,
  code: string,
  factor: SecondFactor,
  channel: "link" | "chat" | "form",
  now: Date = new Date(),
) {
  const view = await findAppointmentPublic(db, code, factor, now);
  await cancelAppointment(db, view.id, { kind: "patient", channel }, now);
  return findAppointmentPublic(db, code, factor, now);
}
