import { and, asc, count, eq, gt, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import {
  appointments,
  locations,
  professionalLocations,
  professionals,
  professionalSpecialties,
  scheduleRules,
  specialties,
} from "@/db/schema";
import { timeToMinutes } from "@/lib/time";
import { assertCan, type Actor } from "@/server/auth/rbac";
import { DomainError } from "@/server/errors";
import { audit, changedFields } from "./audit";
import { boolFromForm, likePattern, optionalText, requiredText } from "./common";

const idList = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]).filter(Boolean))
  .pipe(z.array(z.string().uuid()));

export const ProfessionalInput = z.object({
  title: optionalText(20),
  firstName: requiredText("el nombre", 80),
  lastName: requiredText("el apellido", 80),
  licenseNumber: optionalText(40),
  bio: optionalText(1000),
  active: boolFromForm,
  specialtyIds: idList.refine((v) => v.length > 0, "Elegí al menos una especialidad."),
  locationIds: idList.refine((v) => v.length > 0, "Elegí al menos una sede."),
});
export type ProfessionalInput = z.input<typeof ProfessionalInput>;

export function professionalDisplayName(p: { title: string | null; firstName: string; lastName: string }) {
  return [p.title, p.firstName, p.lastName].filter(Boolean).join(" ");
}

export async function listProfessionals(
  db: Db,
  actor: Actor,
  clinicId: string,
  opts: { q?: string; includeInactive?: boolean; specialtyId?: string; locationId?: string } = {},
) {
  assertCan(actor, "read", "professionals", clinicId);
  const conds = [eq(professionals.clinicId, clinicId), isNull(professionals.deletedAt)];
  if (!opts.includeInactive) conds.push(eq(professionals.active, true));
  if (opts.q) {
    const p = likePattern(opts.q);
    conds.push(
      or(
        ilike(professionals.firstName, p),
        ilike(professionals.lastName, p),
        ilike(sql`${professionals.firstName} || ' ' || ${professionals.lastName}`, p),
        ilike(professionals.licenseNumber, p),
      )!,
    );
  }
  if (opts.specialtyId) {
    conds.push(
      inArray(
        professionals.id,
        db.select({ id: professionalSpecialties.professionalId }).from(professionalSpecialties).where(eq(professionalSpecialties.specialtyId, opts.specialtyId)),
      ),
    );
  }
  if (opts.locationId) {
    conds.push(
      inArray(
        professionals.id,
        db.select({ id: professionalLocations.professionalId }).from(professionalLocations).where(eq(professionalLocations.locationId, opts.locationId)),
      ),
    );
  }
  const rows = await db.select().from(professionals).where(and(...conds)).orderBy(asc(professionals.lastName), asc(professionals.firstName));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [specs, locs] = await Promise.all([
    db
      .select({ professionalId: professionalSpecialties.professionalId, id: specialties.id, name: specialties.name })
      .from(professionalSpecialties)
      .innerJoin(specialties, eq(specialties.id, professionalSpecialties.specialtyId))
      .where(inArray(professionalSpecialties.professionalId, ids)),
    db
      .select({ professionalId: professionalLocations.professionalId, id: locations.id, name: locations.name })
      .from(professionalLocations)
      .innerJoin(locations, eq(locations.id, professionalLocations.locationId))
      .where(inArray(professionalLocations.professionalId, ids)),
  ]);
  return rows.map((r) => ({
    ...r,
    displayName: professionalDisplayName(r),
    specialties: specs.filter((s) => s.professionalId === r.id).map(({ id, name }) => ({ id, name })),
    locations: locs.filter((l) => l.professionalId === r.id).map(({ id, name }) => ({ id, name })),
  }));
}

export async function getProfessional(db: Db, actor: Actor, id: string) {
  const [row] = await db.select().from(professionals).where(and(eq(professionals.id, id), isNull(professionals.deletedAt)));
  if (!row) throw new DomainError("NOT_FOUND", "No encontramos a ese profesional.");
  assertCan(actor, "read", "professionals", row.clinicId);
  const [specs, locs] = await Promise.all([
    db.select({ id: professionalSpecialties.specialtyId }).from(professionalSpecialties).where(eq(professionalSpecialties.professionalId, id)),
    db.select({ id: professionalLocations.locationId }).from(professionalLocations).where(eq(professionalLocations.professionalId, id)),
  ]);
  return {
    ...row,
    displayName: professionalDisplayName(row),
    specialtyIds: specs.map((s) => s.id),
    locationIds: locs.map((l) => l.id),
  };
}

async function assertBelongs(db: Db, clinicId: string, specialtyIds: string[], locationIds: string[]) {
  const [specs, locs] = await Promise.all([
    db.select({ id: specialties.id }).from(specialties).where(and(eq(specialties.clinicId, clinicId), inArray(specialties.id, specialtyIds), isNull(specialties.deletedAt))),
    db.select({ id: locations.id }).from(locations).where(and(eq(locations.clinicId, clinicId), inArray(locations.id, locationIds), isNull(locations.deletedAt))),
  ]);
  if (specs.length !== new Set(specialtyIds).size) throw new DomainError("VALIDATION", "Alguna especialidad no pertenece a esta clínica.");
  if (locs.length !== new Set(locationIds).size) throw new DomainError("VALIDATION", "Alguna sede no pertenece a esta clínica.");
}

export async function saveProfessional(db: Db, actor: Actor, clinicId: string, raw: ProfessionalInput, id?: string) {
  assertCan(actor, "write", "professionals", clinicId);
  const { specialtyIds, locationIds, ...data } = ProfessionalInput.parse(raw);
  await assertBelongs(db, clinicId, specialtyIds, locationIds);

  return db.transaction(async (tx) => {
    let profId = id;
    if (id) {
      const [before] = await tx.select().from(professionals).where(and(eq(professionals.id, id), isNull(professionals.deletedAt)));
      if (!before || before.clinicId !== clinicId) throw new DomainError("NOT_FOUND", "No encontramos a ese profesional.");
      // Removing a location that still has weekly rules would silently hide them.
      const removed = (
        await tx.select({ id: professionalLocations.locationId }).from(professionalLocations).where(eq(professionalLocations.professionalId, id))
      )
        .map((l) => l.id)
        .filter((l) => !locationIds.includes(l));
      if (removed.length) {
        const [{ n }] = await tx
          .select({ n: count() })
          .from(appointments)
          .where(and(eq(appointments.professionalId, id), inArray(appointments.locationId, removed), eq(appointments.status, "confirmed"), gt(appointments.startsAt, new Date())));
        if (n > 0) throw new DomainError("VALIDATION", `Hay ${n} turno(s) futuros en la sede que querés quitar. Movelos o cancelalos primero.`);
        await tx.delete(scheduleRules).where(and(eq(scheduleRules.professionalId, id), inArray(scheduleRules.locationId, removed)));
      }
      await tx.update(professionals).set(data).where(eq(professionals.id, id));
      await audit(tx, actor, { action: "update", entity: "professional", entityId: id, clinicId, data: { fields: changedFields(before, data) } });
    } else {
      const [row] = await tx.insert(professionals).values({ ...data, clinicId }).returning();
      profId = row.id;
      await audit(tx, actor, { action: "create", entity: "professional", entityId: row.id, clinicId });
    }
    await tx.delete(professionalSpecialties).where(eq(professionalSpecialties.professionalId, profId!));
    await tx.insert(professionalSpecialties).values(specialtyIds.map((s) => ({ professionalId: profId!, specialtyId: s })));
    await tx.delete(professionalLocations).where(eq(professionalLocations.professionalId, profId!));
    await tx.insert(professionalLocations).values(locationIds.map((l) => ({ professionalId: profId!, locationId: l })));
    return profId!;
  });
}

export async function deleteProfessional(db: Db, actor: Actor, id: string) {
  const prof = await getProfessional(db, actor, id);
  assertCan(actor, "delete", "professionals", prof.clinicId);
  const [{ n }] = await db
    .select({ n: count() })
    .from(appointments)
    .where(and(eq(appointments.professionalId, id), eq(appointments.status, "confirmed"), gt(appointments.startsAt, new Date())));
  if (n > 0) throw new DomainError("VALIDATION", `Tiene ${n} turno(s) futuros confirmados. Cancelalos o movelos antes de darlo de baja.`);
  await db.update(professionals).set({ deletedAt: new Date(), active: false }).where(eq(professionals.id, id));
  await audit(db, actor, { action: "delete", entity: "professional", entityId: id, clinicId: prof.clinicId });
}

/* ----------------------------- Weekly schedule ---------------------------- */

const timeStr = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Hora inválida (HH:MM).");
const dateStr = z
  .string()
  .optional()
  .nullable()
  .transform((v) => v || null)
  .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.").nullable());

export const ScheduleRuleInput = z
  .object({
    locationId: z.string().uuid("Elegí la sede."),
    weekday: z.coerce.number().int().min(1).max(7),
    startTime: timeStr,
    endTime: timeStr,
    validFrom: dateStr,
    validTo: dateStr,
  })
  .refine((r) => r.startTime.slice(0, 5) !== r.endTime.slice(0, 5), { message: "El horario de inicio y fin no pueden ser iguales.", path: ["endTime"] })
  .refine((r) => !r.validFrom || !r.validTo || r.validFrom <= r.validTo, { message: "La vigencia termina antes de empezar.", path: ["validTo"] });
export type ScheduleRuleInput = z.input<typeof ScheduleRuleInput>;

export const WEEKDAYS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const;

/** Minute ranges of a rule within a 2-week frame (handles overnight rules). */
function ruleRanges(r: { weekday: number; startTime: string; endTime: string }): [number, number][] {
  const s = (r.weekday - 1) * 1440 + timeToMinutes(r.startTime.slice(0, 5));
  let e = (r.weekday - 1) * 1440 + timeToMinutes(r.endTime.slice(0, 5));
  if (e <= s) e += 1440;
  // Sunday overnight wraps into Monday: also check the shifted copy.
  return [[s, e], [s - 7 * 1440, e - 7 * 1440]];
}

function validityOverlaps(a: { validFrom: string | null; validTo: string | null }, b: { validFrom: string | null; validTo: string | null }) {
  const aFrom = a.validFrom ?? "0000-01-01";
  const aTo = a.validTo ?? "9999-12-31";
  const bFrom = b.validFrom ?? "0000-01-01";
  const bTo = b.validTo ?? "9999-12-31";
  return aFrom <= bTo && bFrom <= aTo;
}

/** Returns a human message for the first pair of overlapping rules, or null. */
export function findRuleOverlap(rules: z.output<typeof ScheduleRuleInput>[]): string | null {
  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i];
      const b = rules[j];
      if (!validityOverlaps(a, b)) continue;
      const hit = ruleRanges(a).some(([as, ae]) => ruleRanges(b).some(([bs, be]) => as < be && bs < ae));
      if (hit) {
        return `Los horarios del ${WEEKDAYS[a.weekday].toLowerCase()} (${a.startTime.slice(0, 5)}–${a.endTime.slice(0, 5)}) y del ${WEEKDAYS[b.weekday].toLowerCase()} (${b.startTime.slice(0, 5)}–${b.endTime.slice(0, 5)}) se superponen.`;
      }
    }
  }
  return null;
}

export async function listScheduleRules(db: Db, actor: Actor, professionalId: string) {
  const prof = await getProfessional(db, actor, professionalId);
  assertCan(actor, "read", "schedules", prof.clinicId);
  return db
    .select({ rule: scheduleRules, locationName: locations.name })
    .from(scheduleRules)
    .innerJoin(locations, eq(locations.id, scheduleRules.locationId))
    .where(and(eq(scheduleRules.professionalId, professionalId), eq(scheduleRules.active, true)))
    .orderBy(asc(scheduleRules.weekday), asc(scheduleRules.startTime));
}

/** Replace the whole weekly grid of a professional (validated as a set). */
export async function replaceScheduleRules(db: Db, actor: Actor, professionalId: string, raw: ScheduleRuleInput[]) {
  const prof = await getProfessional(db, actor, professionalId);
  assertCan(actor, "write", "schedules", prof.clinicId);
  const rules = z.array(ScheduleRuleInput).max(100).parse(raw);
  const bad = rules.find((r) => !prof.locationIds.includes(r.locationId));
  if (bad) throw new DomainError("VALIDATION", "Hay un horario en una sede donde este profesional no atiende.");
  const overlap = findRuleOverlap(rules);
  if (overlap) throw new DomainError("VALIDATION", overlap);

  await db.transaction(async (tx) => {
    await tx.delete(scheduleRules).where(eq(scheduleRules.professionalId, professionalId));
    if (rules.length) {
      await tx.insert(scheduleRules).values(rules.map((r) => ({ ...r, professionalId, startTime: r.startTime.slice(0, 5), endTime: r.endTime.slice(0, 5) })));
    }
    await audit(tx, actor, { action: "update", entity: "schedule", entityId: professionalId, clinicId: prof.clinicId, data: { rules: rules.length } });
  });
}
