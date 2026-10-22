import { and, asc, count, eq, gt, ilike, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { appointments, kbDocs, locations, services, specialties } from "@/db/schema";
import { assertCan, type Actor } from "@/server/auth/rbac";
import { DomainError } from "@/server/errors";
import { audit, changedFields } from "./audit";
import { boolFromForm, likePattern, optionalText, parseMoneyToCents, requiredText, slugify } from "./common";

type ListOpts = { q?: string; includeInactive?: boolean };

const notFound = (what: string) => new DomainError("NOT_FOUND", `No encontramos ${what}.`);

async function futureAppointmentsCount(db: Db, where: ReturnType<typeof eq>) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(appointments)
    .where(and(where, eq(appointments.status, "confirmed"), gt(appointments.startsAt, new Date())));
  return n;
}

/* ------------------------------- Locations ------------------------------- */

export const LocationInput = z.object({
  name: requiredText("el nombre", 120),
  address: requiredText("la dirección", 200),
  city: optionalText(100),
  phone: optionalText(40),
  notes: optionalText(1000),
  active: boolFromForm,
});
export type LocationInput = z.input<typeof LocationInput>;

export async function listLocations(db: Db, actor: Actor, clinicId: string, opts: ListOpts = {}) {
  assertCan(actor, "read", "catalog", clinicId);
  const conds = [eq(locations.clinicId, clinicId), isNull(locations.deletedAt)];
  if (!opts.includeInactive) conds.push(eq(locations.active, true));
  if (opts.q) conds.push(or(ilike(locations.name, likePattern(opts.q)), ilike(locations.address, likePattern(opts.q)))!);
  return db.select().from(locations).where(and(...conds)).orderBy(asc(locations.name));
}

export async function getLocation(db: Db, actor: Actor, id: string) {
  const [row] = await db.select().from(locations).where(and(eq(locations.id, id), isNull(locations.deletedAt)));
  if (!row) throw notFound("esa sede");
  assertCan(actor, "read", "catalog", row.clinicId);
  return row;
}

export async function saveLocation(db: Db, actor: Actor, clinicId: string, raw: LocationInput, id?: string) {
  assertCan(actor, "write", "catalog", clinicId);
  const input = LocationInput.parse(raw);
  if (id) {
    const before = await getLocation(db, actor, id);
    if (before.clinicId !== clinicId) throw notFound("esa sede");
    const [row] = await db.update(locations).set(input).where(eq(locations.id, id)).returning();
    await audit(db, actor, { action: "update", entity: "location", entityId: id, clinicId, data: { fields: changedFields(before, input) } });
    return row;
  }
  const [row] = await db.insert(locations).values({ ...input, clinicId }).returning();
  await audit(db, actor, { action: "create", entity: "location", entityId: row.id, clinicId });
  return row;
}

export async function deleteLocation(db: Db, actor: Actor, id: string) {
  const row = await getLocation(db, actor, id);
  assertCan(actor, "delete", "catalog", row.clinicId);
  const n = await futureAppointmentsCount(db, eq(appointments.locationId, id));
  if (n > 0) {
    throw new DomainError("VALIDATION", `La sede tiene ${n} turno(s) futuros confirmados. Cancelalos o movelos antes de darla de baja.`);
  }
  await db.update(locations).set({ deletedAt: new Date(), active: false }).where(eq(locations.id, id));
  await audit(db, actor, { action: "delete", entity: "location", entityId: id, clinicId: row.clinicId });
}

/* ------------------------------- Specialties ----------------------------- */

export const SpecialtyInput = z.object({
  name: requiredText("el nombre", 120),
  description: optionalText(1000),
  active: boolFromForm,
});
export type SpecialtyInput = z.input<typeof SpecialtyInput>;

export async function listSpecialties(db: Db, actor: Actor, clinicId: string, opts: ListOpts = {}) {
  assertCan(actor, "read", "catalog", clinicId);
  const conds = [eq(specialties.clinicId, clinicId), isNull(specialties.deletedAt)];
  if (!opts.includeInactive) conds.push(eq(specialties.active, true));
  if (opts.q) conds.push(ilike(specialties.name, likePattern(opts.q)));
  return db.select().from(specialties).where(and(...conds)).orderBy(asc(specialties.name));
}

export async function getSpecialty(db: Db, actor: Actor, id: string) {
  const [row] = await db.select().from(specialties).where(and(eq(specialties.id, id), isNull(specialties.deletedAt)));
  if (!row) throw notFound("esa especialidad");
  assertCan(actor, "read", "catalog", row.clinicId);
  return row;
}

async function uniqueSpecialtySlug(db: Db, clinicId: string, name: string, exceptId?: string) {
  const base = slugify(name) || "especialidad";
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const [hit] = await db
      .select({ id: specialties.id })
      .from(specialties)
      .where(and(eq(specialties.clinicId, clinicId), eq(specialties.slug, slug)));
    if (!hit || hit.id === exceptId) return slug;
  }
  throw new Error("Could not generate slug");
}

export async function saveSpecialty(db: Db, actor: Actor, clinicId: string, raw: SpecialtyInput, id?: string) {
  assertCan(actor, "write", "catalog", clinicId);
  const input = SpecialtyInput.parse(raw);
  if (id) {
    const before = await getSpecialty(db, actor, id);
    if (before.clinicId !== clinicId) throw notFound("esa especialidad");
    const slug = before.name === input.name ? before.slug : await uniqueSpecialtySlug(db, clinicId, input.name, id);
    const [row] = await db.update(specialties).set({ ...input, slug }).where(eq(specialties.id, id)).returning();
    await audit(db, actor, { action: "update", entity: "specialty", entityId: id, clinicId, data: { fields: changedFields(before, input) } });
    return row;
  }
  const slug = await uniqueSpecialtySlug(db, clinicId, input.name);
  const [row] = await db.insert(specialties).values({ ...input, slug, clinicId }).returning();
  await audit(db, actor, { action: "create", entity: "specialty", entityId: row.id, clinicId });
  return row;
}

export async function deleteSpecialty(db: Db, actor: Actor, id: string) {
  const row = await getSpecialty(db, actor, id);
  assertCan(actor, "delete", "catalog", row.clinicId);
  const n = await futureAppointmentsCount(db, eq(appointments.specialtyId, id));
  if (n > 0) throw new DomainError("VALIDATION", `Hay ${n} turno(s) futuros de esta especialidad. Resolvelos antes de darla de baja.`);
  await db.update(specialties).set({ deletedAt: new Date(), active: false }).where(eq(specialties.id, id));
  await audit(db, actor, { action: "delete", entity: "specialty", entityId: id, clinicId: row.clinicId });
}

/* -------------------------------- Services ------------------------------- */

export const ServiceInput = z.object({
  name: requiredText("el nombre", 120),
  specialtyId: z
    .string()
    .optional()
    .nullable()
    .transform((v) => v || null)
    .pipe(z.string().uuid().nullable()),
  description: optionalText(1000),
  durationMinutes: z.coerce
    .number({ message: "Indicá la duración en minutos." })
    .int("La duración tiene que ser un número entero.")
    .min(5, "Mínimo 5 minutos.")
    .max(480, "Máximo 8 horas."),
  price: z
    .string()
    .optional()
    .nullable()
    .transform((v, ctx) => {
      try {
        return parseMoneyToCents(v);
      } catch {
        ctx.addIssue({ code: "custom", message: "Ingresá un precio válido (por ejemplo 35000 o 35.000,50)." });
        return z.NEVER;
      }
    }),
  active: boolFromForm,
});
export type ServiceInput = z.input<typeof ServiceInput>;

export async function listServices(db: Db, actor: Actor, clinicId: string, opts: ListOpts & { specialtyId?: string } = {}) {
  assertCan(actor, "read", "catalog", clinicId);
  const conds = [eq(services.clinicId, clinicId), isNull(services.deletedAt)];
  if (!opts.includeInactive) conds.push(eq(services.active, true));
  if (opts.specialtyId) conds.push(eq(services.specialtyId, opts.specialtyId));
  if (opts.q) conds.push(ilike(services.name, likePattern(opts.q)));
  return db
    .select({ service: services, specialtyName: specialties.name })
    .from(services)
    .leftJoin(specialties, eq(specialties.id, services.specialtyId))
    .where(and(...conds))
    .orderBy(asc(specialties.name), asc(services.name));
}

export async function getService(db: Db, actor: Actor, id: string) {
  const [row] = await db.select().from(services).where(and(eq(services.id, id), isNull(services.deletedAt)));
  if (!row) throw notFound("ese tipo de consulta");
  assertCan(actor, "read", "catalog", row.clinicId);
  return row;
}

export async function saveService(db: Db, actor: Actor, clinicId: string, raw: ServiceInput, id?: string) {
  assertCan(actor, "write", "catalog", clinicId);
  const { price, ...rest } = ServiceInput.parse(raw);
  const values = { ...rest, priceCents: price };
  if (values.specialtyId) {
    const [s] = await db
      .select({ id: specialties.id })
      .from(specialties)
      .where(and(eq(specialties.id, values.specialtyId), eq(specialties.clinicId, clinicId), isNull(specialties.deletedAt)));
    if (!s) throw new DomainError("VALIDATION", "Elegí una especialidad de esta clínica.");
  }
  if (id) {
    const before = await getService(db, actor, id);
    if (before.clinicId !== clinicId) throw notFound("ese tipo de consulta");
    const [row] = await db.update(services).set(values).where(eq(services.id, id)).returning();
    await audit(db, actor, { action: "update", entity: "service", entityId: id, clinicId, data: { fields: changedFields(before, values) } });
    return row;
  }
  const [row] = await db.insert(services).values({ ...values, clinicId }).returning();
  await audit(db, actor, { action: "create", entity: "service", entityId: row.id, clinicId });
  return row;
}

export async function deleteService(db: Db, actor: Actor, id: string) {
  const row = await getService(db, actor, id);
  assertCan(actor, "delete", "catalog", row.clinicId);
  await db.update(services).set({ deletedAt: new Date(), active: false }).where(eq(services.id, id));
  await audit(db, actor, { action: "delete", entity: "service", entityId: id, clinicId: row.clinicId });
}

/* ------------------------------ FAQ / KB docs ---------------------------- */

export const KbDocInput = z.object({
  question: requiredText("la pregunta", 300),
  answer: requiredText("la respuesta", 4000),
  tags: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) =>
      (Array.isArray(v) ? v : (v ?? "").split(","))
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 10),
    ),
  active: boolFromForm,
});
export type KbDocInput = z.input<typeof KbDocInput>;

export async function listKbDocs(db: Db, actor: Actor, clinicId: string, opts: ListOpts = {}) {
  assertCan(actor, "read", "catalog", clinicId);
  const conds = [eq(kbDocs.clinicId, clinicId), isNull(kbDocs.deletedAt)];
  if (!opts.includeInactive) conds.push(eq(kbDocs.active, true));
  if (opts.q) conds.push(or(ilike(kbDocs.question, likePattern(opts.q)), ilike(kbDocs.answer, likePattern(opts.q)))!);
  return db.select().from(kbDocs).where(and(...conds)).orderBy(asc(kbDocs.question));
}

export async function getKbDoc(db: Db, actor: Actor, id: string) {
  const [row] = await db.select().from(kbDocs).where(and(eq(kbDocs.id, id), isNull(kbDocs.deletedAt)));
  if (!row) throw notFound("esa pregunta");
  assertCan(actor, "read", "catalog", row.clinicId);
  return row;
}

export async function saveKbDoc(db: Db, actor: Actor, clinicId: string, raw: KbDocInput, id?: string) {
  assertCan(actor, "write", "catalog", clinicId);
  const input = KbDocInput.parse(raw);
  if (id) {
    const before = await getKbDoc(db, actor, id);
    if (before.clinicId !== clinicId) throw notFound("esa pregunta");
    const [row] = await db.update(kbDocs).set(input).where(eq(kbDocs.id, id)).returning();
    await audit(db, actor, { action: "update", entity: "kb_doc", entityId: id, clinicId, data: { fields: changedFields(before, input) } });
    return row;
  }
  const [row] = await db.insert(kbDocs).values({ ...input, clinicId }).returning();
  await audit(db, actor, { action: "create", entity: "kb_doc", entityId: row.id, clinicId });
  return row;
}

export async function deleteKbDoc(db: Db, actor: Actor, id: string) {
  const row = await getKbDoc(db, actor, id);
  assertCan(actor, "delete", "catalog", row.clinicId);
  await db.update(kbDocs).set({ deletedAt: new Date(), active: false }).where(eq(kbDocs.id, id));
  await audit(db, actor, { action: "delete", entity: "kb_doc", entityId: id, clinicId: row.clinicId });
}

/** Ids → rows of this clinic (used to validate multi-selects). */
export async function locationsOfClinic(db: Db, clinicId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.clinicId, clinicId), inArray(locations.id, ids), isNull(locations.deletedAt)));
}
