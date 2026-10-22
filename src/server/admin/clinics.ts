import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { clinics, settings } from "@/db/schema";
import { assertCan, type Actor } from "@/server/auth/rbac";
import { getClinicContext } from "@/server/clinics/settings";
import { DomainError } from "@/server/errors";
import { audit, changedFields } from "./audit";
import { boolFromForm, optionalText, requiredText, slugify } from "./common";

export const ClinicInput = z.object({
  name: requiredText("el nombre", 120),
  phone: optionalText(40),
  email: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => v || null)
    .pipe(z.string().email("Email inválido.").nullable()),
  website: optionalText(200),
  timezone: z
    .string()
    .default("America/Argentina/Buenos_Aires")
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("es-AR", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Zona horaria inválida."),
  active: boolFromForm,
});
export type ClinicInput = z.input<typeof ClinicInput>;

export async function listClinics(db: Db, actor: Actor) {
  const conds = [isNull(clinics.deletedAt)];
  if (actor.role !== "superadmin") {
    if (!actor.clinicId) return [];
    conds.push(eq(clinics.id, actor.clinicId));
  }
  return db.select().from(clinics).where(and(...conds)).orderBy(asc(clinics.name));
}

export async function getClinic(db: Db, actor: Actor, id: string) {
  assertCan(actor, "read", "clinics", id);
  const [row] = await db.select().from(clinics).where(and(eq(clinics.id, id), isNull(clinics.deletedAt)));
  if (!row) throw new DomainError("NOT_FOUND", "No encontramos esa clínica.");
  return row;
}

export async function saveClinic(db: Db, actor: Actor, raw: ClinicInput, id?: string) {
  const input = ClinicInput.parse(raw);
  if (id) {
    assertCan(actor, "write", "clinics", id);
    const before = await getClinic(db, actor, id);
    const [row] = await db.update(clinics).set(input).where(eq(clinics.id, id)).returning();
    await audit(db, actor, { action: "update", entity: "clinic", entityId: id, clinicId: id, data: { fields: changedFields(before, input) } });
    return row;
  }
  if (actor.role !== "superadmin") throw new DomainError("FORBIDDEN", "Solo un superadmin puede crear clínicas.");
  return db.transaction(async (tx) => {
    let slug = slugify(input.name) || "clinica";
    const [hit] = await tx.select({ id: clinics.id }).from(clinics).where(eq(clinics.slug, slug));
    if (hit) slug = `${slug}-${Date.now().toString(36)}`;
    const [row] = await tx.insert(clinics).values({ ...input, slug }).returning();
    await tx.insert(settings).values({ clinicId: row.id, contactPhone: input.phone, contactEmail: input.email });
    await audit(tx, actor, { action: "create", entity: "clinic", entityId: row.id, clinicId: row.id });
    return row;
  });
}

export async function deleteClinic(db: Db, actor: Actor, id: string) {
  assertCan(actor, "delete", "clinics", id);
  await getClinic(db, actor, id);
  await db.update(clinics).set({ deletedAt: new Date(), active: false }).where(eq(clinics.id, id));
  await audit(db, actor, { action: "delete", entity: "clinic", entityId: id, clinicId: id });
}

/* -------------------------------- Settings -------------------------------- */

const int = (label: string, min: number, max: number) =>
  z.coerce
    .number({ message: `Indicá ${label}.` })
    .int(`${label} tiene que ser un número entero.`)
    .min(min, `${label}: mínimo ${min}.`)
    .max(max, `${label}: máximo ${max}.`);

export const SettingsInput = z.object({
  cancelMinHours: int("Las horas mínimas para cancelar", 0, 720),
  slotStepMinutes: int("La duración de la grilla", 5, 240),
  bookingHorizonDays: int("El horizonte de reserva", 1, 365),
  minLeadMinutes: int("La anticipación mínima", 0, 10080),
  reminderHours: int("El recordatorio", 1, 336),
  welcomeText: requiredText("el texto de bienvenida", 500),
  assistantTone: requiredText("el tono del asistente", 500),
  contactPhone: optionalText(40),
  contactEmail: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => v || null)
    .pipe(z.string().email("Email inválido.").nullable()),
  contactHours: optionalText(200),
  outOfWindowMessage: requiredText("el mensaje fuera de ventana", 500),
  emergencyMessage: requiredText("el mensaje de emergencia", 500),
});
export type SettingsInput = z.input<typeof SettingsInput>;

export async function getSettings(db: Db, actor: Actor, clinicId: string) {
  assertCan(actor, "read", "settings", clinicId);
  return (await getClinicContext(db, clinicId)).settings;
}

export async function saveSettings(db: Db, actor: Actor, clinicId: string, raw: SettingsInput) {
  assertCan(actor, "write", "settings", clinicId);
  const input = SettingsInput.parse(raw);
  const before = await getSettings(db, actor, clinicId);
  const [row] = await db.update(settings).set(input).where(eq(settings.clinicId, clinicId)).returning();
  await audit(db, actor, { action: "update", entity: "settings", entityId: clinicId, clinicId, data: { fields: changedFields(before, input) } });
  return row;
}
