import { and, asc, count, eq, gt, lt, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { appointments, locations, professionals, scheduleExceptions } from "@/db/schema";
import { addDays, localDateTimeToUtc, localToUtc } from "@/lib/time";
import { assertCan, type Actor } from "@/server/auth/rbac";
import { getClinicContext } from "@/server/clinics/settings";
import { DomainError } from "@/server/errors";
import { audit } from "./audit";
import { boolFromForm, optionalText } from "./common";
import { getProfessional } from "./professionals";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elegí una fecha.");
const time = z
  .string()
  .optional()
  .transform((v) => v || undefined)
  .pipe(z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida.").optional());
const optId = z
  .string()
  .optional()
  .nullable()
  .transform((v) => v || null)
  .pipe(z.string().uuid().nullable());

export const ExceptionInput = z
  .object({
    scope: z.enum(["clinic", "location", "professional"]),
    kind: z.enum(["block", "extra"]),
    locationId: optId,
    professionalId: optId,
    startDate: date,
    endDate: date,
    allDay: boolFromForm,
    startTime: time,
    endTime: time,
    reason: optionalText(200),
  })
  .superRefine((v, ctx) => {
    if (v.endDate < v.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "La fecha de fin es anterior a la de inicio." });
    if (!v.allDay && (!v.startTime || !v.endTime)) ctx.addIssue({ code: "custom", path: ["startTime"], message: "Indicá hora de inicio y de fin, o marcá «Todo el día»." });
    if (v.scope === "location" && !v.locationId) ctx.addIssue({ code: "custom", path: ["locationId"], message: "Elegí la sede." });
    if (v.scope === "professional" && !v.professionalId) ctx.addIssue({ code: "custom", path: ["professionalId"], message: "Elegí el profesional." });
    if (v.kind === "extra" && (v.scope !== "professional" || !v.locationId)) {
      ctx.addIssue({ code: "custom", path: ["kind"], message: "El horario extra se carga para un profesional y una sede." });
    }
  });
export type ExceptionInput = z.input<typeof ExceptionInput>;

export type ExceptionCreated = { id: string; affectedAppointments: number };

export async function createException(db: Db, actor: Actor, clinicId: string, raw: ExceptionInput): Promise<ExceptionCreated> {
  assertCan(actor, "write", "schedules", clinicId);
  const v = ExceptionInput.parse(raw);
  const { clinic } = await getClinicContext(db, clinicId);
  const tz = clinic.timezone;

  const startsAt = v.allDay ? localToUtc(v.startDate, 0, tz) : localDateTimeToUtc(v.startDate, v.startTime!, tz);
  const endsAt = v.allDay ? localToUtc(addDays(v.endDate, 1), 0, tz) : localDateTimeToUtc(v.endDate, v.endTime!, tz);
  if (endsAt <= startsAt) throw new DomainError("VALIDATION", "El fin tiene que ser posterior al inicio.");

  const locationId = v.scope === "clinic" ? null : v.locationId;
  const professionalId = v.scope === "professional" ? v.professionalId : null;
  if (locationId) {
    const [l] = await db.select({ id: locations.id }).from(locations).where(and(eq(locations.id, locationId), eq(locations.clinicId, clinicId)));
    if (!l) throw new DomainError("VALIDATION", "Esa sede no pertenece a la clínica.");
  }
  if (professionalId) {
    const prof = await getProfessional(db, actor, professionalId);
    if (prof.clinicId !== clinicId) throw new DomainError("VALIDATION", "Ese profesional no pertenece a la clínica.");
    if (locationId && !prof.locationIds.includes(locationId)) throw new DomainError("VALIDATION", "Ese profesional no atiende en esa sede.");
  }

  const [row] = await db
    .insert(scheduleExceptions)
    .values({ clinicId, scope: v.scope, kind: v.kind, locationId, professionalId, startsAt, endsAt, reason: v.reason })
    .returning();
  await audit(db, actor, { action: "create", entity: "schedule_exception", entityId: row.id, clinicId, data: { scope: v.scope, kind: v.kind } });

  // Blocks do not cancel anything automatically: report what is affected.
  let affectedAppointments = 0;
  if (v.kind === "block") {
    const conds: SQL[] = [
      eq(appointments.clinicId, clinicId),
      eq(appointments.status, "confirmed"),
      lt(appointments.startsAt, endsAt),
      gt(appointments.endsAt, startsAt),
    ];
    if (professionalId) conds.push(eq(appointments.professionalId, professionalId));
    if (locationId) conds.push(eq(appointments.locationId, locationId));
    [{ n: affectedAppointments }] = await db.select({ n: count() }).from(appointments).where(and(...conds));
  }
  return { id: row.id, affectedAppointments };
}

export async function listExceptions(
  db: Db,
  actor: Actor,
  clinicId: string,
  opts: { from?: Date; to?: Date; scope?: "clinic" | "location" | "professional"; professionalId?: string; kind?: "block" | "extra" } = {},
) {
  assertCan(actor, "read", "schedules", clinicId);
  const conds: SQL[] = [eq(scheduleExceptions.clinicId, clinicId)];
  if (opts.from) conds.push(gt(scheduleExceptions.endsAt, opts.from));
  if (opts.to) conds.push(lt(scheduleExceptions.startsAt, opts.to));
  if (opts.scope) conds.push(eq(scheduleExceptions.scope, opts.scope));
  if (opts.kind) conds.push(eq(scheduleExceptions.kind, opts.kind));
  if (opts.professionalId) conds.push(eq(scheduleExceptions.professionalId, opts.professionalId));
  const rows = await db
    .select({ exception: scheduleExceptions, locationName: locations.name, professionalFirst: professionals.firstName, professionalLast: professionals.lastName, professionalTitle: professionals.title })
    .from(scheduleExceptions)
    .leftJoin(locations, eq(locations.id, scheduleExceptions.locationId))
    .leftJoin(professionals, eq(professionals.id, scheduleExceptions.professionalId))
    .where(and(...conds))
    .orderBy(asc(scheduleExceptions.startsAt))
    .limit(500);
  return rows;
}

export async function deleteException(db: Db, actor: Actor, id: string) {
  const [row] = await db.select().from(scheduleExceptions).where(eq(scheduleExceptions.id, id));
  if (!row) throw new DomainError("NOT_FOUND", "No encontramos esa excepción.");
  assertCan(actor, "write", "schedules", row.clinicId);
  // Exceptions are configuration, not records: a hard delete is fine (audited).
  await db.delete(scheduleExceptions).where(eq(scheduleExceptions.id, id));
  await audit(db, actor, {
    action: "delete",
    entity: "schedule_exception",
    entityId: id,
    clinicId: row.clinicId,
    data: { scope: row.scope, kind: row.kind, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() },
  });
}
