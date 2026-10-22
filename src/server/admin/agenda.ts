import { and, asc, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  appointments,
  locations,
  patients,
  professionalLocations,
  professionals,
  scheduleExceptions,
  services,
  type AppointmentStatus,
} from "@/db/schema";
import { addDays, localToUtc, utcToLocal, weekdayOf, type LocalDate } from "@/lib/time";
import { computeOpenWindows } from "@/server/availability/engine";
import { loadScheduleData } from "@/server/availability/service";
import { assertCan, type Actor } from "@/server/auth/rbac";
import { getClinicContext } from "@/server/clinics/settings";
import { DomainError } from "@/server/errors";
import { professionalDisplayName } from "./professionals";

export type AgendaView = "day" | "week";
export type AgendaMode = "professional" | "location";

export type AgendaAppointment = {
  id: string;
  code: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  source: string;
  patientName: string;
  serviceName: string;
  serviceId: string;
  professionalId: string;
  professionalName: string;
  locationId: string;
  locationName: string;
};

export type AgendaColumn = {
  key: string;
  date: LocalDate;
  title: string;
  /** Present in location/day mode (one column per professional). */
  professionalId?: string;
  open: { start: string; end: string; locationId: string; professionalId: string }[];
  blocks: { start: string; end: string; reason: string | null }[];
  appointments: AgendaAppointment[];
};

export type AgendaData = {
  timezone: string;
  stepMinutes: number;
  view: AgendaView;
  mode: AgendaMode;
  date: LocalDate;
  days: LocalDate[];
  /** Visible hours (local minutes since midnight). */
  startMinute: number;
  endMinute: number;
  columns: AgendaColumn[];
  subject: { id: string; name: string } | null;
};

/** Monday of the week containing `date`. */
export function weekStart(date: LocalDate): LocalDate {
  return addDays(date, -(weekdayOf(date) - 1));
}

export async function getAgenda(
  db: Db,
  actor: Actor,
  clinicId: string,
  p: { view: AgendaView; mode: AgendaMode; date: LocalDate; subjectId?: string | null; includeCancelled?: boolean },
): Promise<AgendaData> {
  assertCan(actor, "read", "appointments", clinicId);
  const { clinic, settings } = await getClinicContext(db, clinicId);
  const tz = clinic.timezone;
  const days = p.view === "day" ? [p.date] : Array.from({ length: 7 }, (_, i) => addDays(weekStart(p.date), i));
  const from = localToUtc(days[0], 0, tz);
  const to = localToUtc(addDays(days[days.length - 1], 1), 0, tz);

  // Professionals in scope.
  let profRows: (typeof professionals.$inferSelect)[] = [];
  let subject: AgendaData["subject"] = null;
  if (p.mode === "professional") {
    if (p.subjectId) {
      profRows = await db
        .select()
        .from(professionals)
        .where(and(eq(professionals.id, p.subjectId), eq(professionals.clinicId, clinicId), isNull(professionals.deletedAt)));
      if (!profRows.length) throw new DomainError("NOT_FOUND", "No encontramos a ese profesional.");
      subject = { id: profRows[0].id, name: professionalDisplayName(profRows[0]) };
    }
  } else if (p.subjectId) {
    const [loc] = await db.select().from(locations).where(and(eq(locations.id, p.subjectId), eq(locations.clinicId, clinicId)));
    if (!loc) throw new DomainError("NOT_FOUND", "No encontramos esa sede.");
    subject = { id: loc.id, name: loc.name };
    profRows = await db
      .select({ p: professionals })
      .from(professionals)
      .innerJoin(professionalLocations, eq(professionalLocations.professionalId, professionals.id))
      .where(and(eq(professionalLocations.locationId, loc.id), eq(professionals.active, true), isNull(professionals.deletedAt)))
      .orderBy(asc(professionals.lastName))
      .then((r) => r.map((x) => x.p));
  }

  const profIds = profRows.map((r) => r.id);
  const locationFilter = p.mode === "location" ? p.subjectId ?? undefined : undefined;

  // Openings per professional.
  const open: AgendaColumn["open"] = [];
  for (const prof of profRows) {
    const linked = await db
      .select({ id: professionalLocations.locationId })
      .from(professionalLocations)
      .where(eq(professionalLocations.professionalId, prof.id));
    const linkedIds = linked.map((l) => l.id);
    const allowed = locationFilter ? linkedIds.filter((l) => l === locationFilter) : linkedIds;
    const data = await loadScheduleData(db, {
      clinicId,
      professionalId: prof.id,
      professionalLocationIds: linkedIds,
      allowedLocationIds: allowed,
      from,
      to,
    });
    for (const w of computeOpenWindows({ timezone: tz, from, to, rules: data.rules, exceptions: data.exceptions })) {
      open.push({ start: w.start.toISOString(), end: w.end.toISOString(), locationId: w.locationId, professionalId: prof.id });
    }
  }

  // Appointments.
  const apptConds = [
    eq(appointments.clinicId, clinicId),
    lt(appointments.startsAt, to),
    gt(appointments.endsAt, from),
  ];
  if (p.mode === "professional" && profIds.length) apptConds.push(inArray(appointments.professionalId, profIds));
  if (locationFilter) apptConds.push(eq(appointments.locationId, locationFilter));
  if (!p.includeCancelled) apptConds.push(inArray(appointments.status, ["confirmed", "completed", "no_show"]));
  const apptRows =
    profIds.length || p.mode === "location"
      ? await db
          .select({
            id: appointments.id,
            code: appointments.code,
            startsAt: appointments.startsAt,
            endsAt: appointments.endsAt,
            status: appointments.status,
            source: appointments.source,
            patientName: patients.fullName,
            serviceName: services.name,
            serviceId: services.id,
            professionalId: professionals.id,
            pTitle: professionals.title,
            pFirst: professionals.firstName,
            pLast: professionals.lastName,
            locationId: locations.id,
            locationName: locations.name,
          })
          .from(appointments)
          .innerJoin(patients, eq(patients.id, appointments.patientId))
          .innerJoin(services, eq(services.id, appointments.serviceId))
          .innerJoin(professionals, eq(professionals.id, appointments.professionalId))
          .innerJoin(locations, eq(locations.id, appointments.locationId))
          .where(and(...apptConds))
          .orderBy(asc(appointments.startsAt))
      : [];
  const appts: AgendaAppointment[] = apptRows.map((r) => ({
    id: r.id,
    code: r.code,
    startsAt: r.startsAt.toISOString(),
    endsAt: r.endsAt.toISOString(),
    status: r.status,
    source: r.source,
    patientName: r.patientName,
    serviceName: r.serviceName,
    serviceId: r.serviceId,
    professionalId: r.professionalId,
    professionalName: professionalDisplayName({ title: r.pTitle, firstName: r.pFirst, lastName: r.pLast }),
    locationId: r.locationId,
    locationName: r.locationName,
  }));

  // Blocks to draw (holidays, closures, vacations).
  const blockRows = await db
    .select()
    .from(scheduleExceptions)
    .where(
      and(
        eq(scheduleExceptions.clinicId, clinicId),
        eq(scheduleExceptions.kind, "block"),
        lt(scheduleExceptions.startsAt, to),
        gt(scheduleExceptions.endsAt, from),
        or(
          eq(scheduleExceptions.scope, "clinic"),
          locationFilter ? eq(scheduleExceptions.locationId, locationFilter) : undefined,
          profIds.length ? inArray(scheduleExceptions.professionalId, profIds) : undefined,
        ),
      ),
    );

  const dayOf = (iso: string) => utcToLocal(new Date(iso), tz).date;
  const columns: AgendaColumn[] = [];
  const blocksFor = (date: LocalDate, profId?: string) => {
    const ds = localToUtc(date, 0, tz).getTime();
    const de = localToUtc(addDays(date, 1), 0, tz).getTime();
    return blockRows
      .filter((b) => b.startsAt.getTime() < de && b.endsAt.getTime() > ds)
      .filter((b) => b.scope !== "professional" || !profId || b.professionalId === profId)
      .filter((b) => p.mode === "location" || b.scope !== "professional" || profIds.includes(b.professionalId!))
      .map((b) => ({
        start: new Date(Math.max(b.startsAt.getTime(), ds)).toISOString(),
        end: new Date(Math.min(b.endsAt.getTime(), de)).toISOString(),
        reason: b.reason,
      }));
  };

  if (p.mode === "location" && p.view === "day") {
    for (const prof of profRows) {
      columns.push({
        key: prof.id,
        date: p.date,
        title: professionalDisplayName(prof),
        professionalId: prof.id,
        open: open.filter((o) => o.professionalId === prof.id),
        blocks: blocksFor(p.date, prof.id),
        appointments: appts.filter((a) => a.professionalId === prof.id),
      });
    }
  } else {
    for (const d of days) {
      columns.push({
        key: d,
        date: d,
        title: d,
        professionalId: p.mode === "professional" ? profRows[0]?.id : undefined,
        open: open.filter((o) => dayOf(o.start) === d),
        blocks: blocksFor(d, p.mode === "professional" ? profRows[0]?.id : undefined),
        appointments: appts.filter((a) => dayOf(a.startsAt) === d),
      });
    }
  }

  // Visible hours: 08–20 by default, expanded to whatever is scheduled.
  let startMinute = 8 * 60;
  let endMinute = 20 * 60;
  for (const c of columns) {
    for (const x of [...c.open, ...c.appointments.map((a) => ({ start: a.startsAt, end: a.endsAt }))]) {
      const s = utcToLocal(new Date(x.start), tz);
      const e = utcToLocal(new Date(x.end), tz);
      startMinute = Math.min(startMinute, s.minutes);
      endMinute = Math.max(endMinute, e.date !== s.date ? 24 * 60 : e.minutes);
    }
  }
  startMinute = Math.floor(startMinute / 60) * 60;
  endMinute = Math.min(24 * 60, Math.ceil(endMinute / 60) * 60);

  return { timezone: tz, stepMinutes: settings.slotStepMinutes, view: p.view, mode: p.mode, date: p.date, days, startMinute, endMinute, columns, subject };
}
