import { and, eq, gt, inArray, isNull, lt, ne, or } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/db/client";
import {
  ACTIVE_APPOINTMENT_STATUSES,
  appointments,
  locations,
  professionalLocations,
  professionals,
  professionalSpecialties,
  scheduleExceptions,
  scheduleRules,
  services,
} from "@/db/schema";
import { getClinicContext } from "@/server/clinics/settings";
import { DomainError } from "@/server/errors";
import { computeAvailableSlots, type Slot } from "./engine";

export const AvailabilityQuery = z
  .object({
    professionalId: z.string().uuid(),
    locationId: z.string().uuid().nullish(),
    serviceId: z.string().uuid(),
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine((q) => q.to.getTime() > q.from.getTime(), { message: "`to` must be after `from`" })
  .refine((q) => q.to.getTime() - q.from.getTime() <= 93 * 86_400_000, {
    message: "Range too large (max 93 days)",
  });
export type AvailabilityQuery = z.input<typeof AvailabilityQuery>;

export type AvailabilityResult = {
  timezone: string;
  durationMinutes: number;
  slots: Slot[];
};

const DAY = 86_400_000;

/** Validate that a professional can provide a service at an (optional) location. */
export async function loadBookingContext(
  db: DbOrTx,
  q: { professionalId: string; serviceId: string; locationId?: string | null },
) {
  const [prof] = await db
    .select()
    .from(professionals)
    .where(and(eq(professionals.id, q.professionalId), isNull(professionals.deletedAt)))
    .limit(1);
  if (!prof || !prof.active) throw new DomainError("NOT_FOUND", "No encontramos a ese profesional.");

  const [svc] = await db
    .select()
    .from(services)
    .where(and(eq(services.id, q.serviceId), isNull(services.deletedAt)))
    .limit(1);
  if (!svc || !svc.active || svc.clinicId !== prof.clinicId) {
    throw new DomainError("NOT_FOUND", "No encontramos ese tipo de consulta.");
  }

  if (svc.specialtyId) {
    const [ps] = await db
      .select()
      .from(professionalSpecialties)
      .where(
        and(
          eq(professionalSpecialties.professionalId, prof.id),
          eq(professionalSpecialties.specialtyId, svc.specialtyId),
        ),
      )
      .limit(1);
    if (!ps) throw new DomainError("VALIDATION", "Ese profesional no atiende ese tipo de consulta.");
  }

  const profLocations = await db
    .select({ id: locations.id })
    .from(professionalLocations)
    .innerJoin(locations, eq(locations.id, professionalLocations.locationId))
    .where(
      and(
        eq(professionalLocations.professionalId, prof.id),
        eq(locations.active, true),
        isNull(locations.deletedAt),
      ),
    );
  const locationIds = profLocations.map((l) => l.id);
  if (q.locationId && !locationIds.includes(q.locationId)) {
    throw new DomainError("VALIDATION", "Ese profesional no atiende en esa sede.");
  }

  const ctx = await getClinicContext(db, prof.clinicId);
  return { professional: prof, service: svc, locationIds, ...ctx };
}

/**
 * Real availability for a professional + service, in the clinic's timezone.
 * The only source of truth for slots shown to patients (form and assistant).
 */
export async function getAvailableSlots(
  db: DbOrTx,
  query: AvailabilityQuery,
  now: Date = new Date(),
  opts: { staff?: boolean; excludeAppointmentId?: string } = {},
): Promise<AvailabilityResult> {
  const q = AvailabilityQuery.parse(query);
  const bc = await loadBookingContext(db, q);
  const { settings: st, clinic } = bc;

  // Staff (admin agenda) are not bound by the patient-facing horizon or lead time.
  const horizonEnd = opts.staff ? Infinity : now.getTime() + st.bookingHorizonDays * DAY;
  const to = new Date(Math.min(q.to.getTime(), horizonEnd));
  const from = q.from;
  const base = { timezone: clinic.timezone, durationMinutes: bc.service.durationMinutes };
  if (to <= from || bc.locationIds.length === 0) return { ...base, slots: [] };

  const allowedLocations = q.locationId ? [q.locationId] : bc.locationIds;
  const { rules, exceptions, busy } = await loadScheduleData(db, {
    clinicId: clinic.id,
    professionalId: bc.professional.id,
    professionalLocationIds: bc.locationIds,
    allowedLocationIds: allowedLocations,
    from,
    to,
    excludeAppointmentId: opts.excludeAppointmentId,
  });

  const slots = computeAvailableSlots({
    timezone: clinic.timezone,
    now,
    from,
    to,
    durationMinutes: bc.service.durationMinutes,
    stepMinutes: st.slotStepMinutes,
    minLeadMinutes: opts.staff ? 0 : st.minLeadMinutes,
    locationId: q.locationId ?? null,
    rules,
    exceptions,
    busy,
  });

  return { ...base, slots };
}

/**
 * Weekly rules, relevant exceptions and busy intervals for one professional
 * around [from, to), already shaped for the engine. Shared by availability,
 * the admin agenda and occupancy stats.
 */
export async function loadScheduleData(
  db: DbOrTx,
  p: {
    clinicId: string;
    professionalId: string;
    professionalLocationIds: string[];
    allowedLocationIds: string[];
    from: Date;
    to: Date;
    excludeAppointmentId?: string;
  },
) {
  // Pad the window: overnight blocks and long services can reach across edges.
  const padFrom = new Date(p.from.getTime() - DAY);
  const padTo = new Date(p.to.getTime() + DAY);
  if (p.allowedLocationIds.length === 0) return { rules: [], exceptions: [], busy: [] };

  const [rules, exceptions, busy] = await Promise.all([
    db
      .select()
      .from(scheduleRules)
      .where(
        and(
          eq(scheduleRules.professionalId, p.professionalId),
          eq(scheduleRules.active, true),
          inArray(scheduleRules.locationId, p.allowedLocationIds),
        ),
      ),
    db
      .select()
      .from(scheduleExceptions)
      .where(
        and(
          eq(scheduleExceptions.clinicId, p.clinicId),
          lt(scheduleExceptions.startsAt, padTo),
          gt(scheduleExceptions.endsAt, padFrom),
          or(
            eq(scheduleExceptions.scope, "clinic"),
            p.professionalLocationIds.length
              ? and(eq(scheduleExceptions.scope, "location"), inArray(scheduleExceptions.locationId, p.professionalLocationIds))
              : undefined,
            and(eq(scheduleExceptions.scope, "professional"), eq(scheduleExceptions.professionalId, p.professionalId)),
          ),
        ),
      ),
    db
      .select({ startsAt: appointments.startsAt, endsAt: appointments.endsAt })
      .from(appointments)
      .where(
        and(
          eq(appointments.professionalId, p.professionalId),
          inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
          p.excludeAppointmentId ? ne(appointments.id, p.excludeAppointmentId) : undefined,
          lt(appointments.startsAt, padTo),
          gt(appointments.endsAt, padFrom),
        ),
      ),
  ]);

  return {
    rules: rules.map((r) => ({
      locationId: r.locationId,
      weekday: r.weekday,
      startTime: r.startTime,
      endTime: r.endTime,
      validFrom: r.validFrom,
      validTo: r.validTo,
    })),
    exceptions: exceptions
      // Extra hours must be at an allowed location.
      .filter((e) => e.kind === "block" || (e.locationId && p.allowedLocationIds.includes(e.locationId)))
      .map((e) => ({ kind: e.kind, locationId: e.locationId, startsAt: e.startsAt, endsAt: e.endsAt })),
    busy,
  };
}
