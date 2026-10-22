import { and, count, desc, eq, gt, ilike, isNull, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { appointments, locations, patients, professionals, services } from "@/db/schema";
import { normalizeAppointmentCode } from "@/lib/codes";
import { blindIndex, decrypt, encrypt, isPlausiblePhone, normalizeEmail, normalizeName, normalizePhone } from "@/lib/pii";
import { assertCan, type Actor } from "@/server/auth/rbac";
import { DomainError, PG_UNIQUE_VIOLATION, pgErrorCode } from "@/server/errors";
import { audit } from "./audit";
import { likePattern, pageParams } from "./common";

export const AdminPatientInput = z.object({
  fullName: z.string().trim().min(3, "Ingresá nombre y apellido.").max(120),
  phone: z.string().trim().max(40).refine(isPlausiblePhone, "Ingresá un teléfono válido, con código de área."),
  email: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => v || null)
    .pipe(z.string().email("Email inválido.").nullable()),
});
export type AdminPatientInput = z.input<typeof AdminPatientInput>;

export type PatientSearchResult = {
  id: string;
  fullName: string;
  phoneLast4: string;
  hasEmail: boolean;
  createdAt: Date;
  appointmentCount: number;
};

/**
 * Search patients by name (partial), or by exact phone / email / appointment
 * code. Phones and emails are encrypted, so they match only exactly
 * (after normalization) via their blind index.
 */
export async function searchPatients(
  db: Db,
  actor: Actor,
  clinicId: string,
  opts: { q?: string; page?: number; limit?: number } = {},
): Promise<{ rows: PatientSearchResult[]; total: number; mode: "name" | "phone" | "email" | "code" | "all" }> {
  assertCan(actor, "read", "patients", clinicId);
  const q = (opts.q ?? "").trim();
  const { limit, offset } = opts.limit ? { limit: opts.limit, offset: 0 } : pageParams(opts.page);
  const conds: SQL[] = [eq(patients.clinicId, clinicId), isNull(patients.deletedAt)];
  let mode: "name" | "phone" | "email" | "code" | "all" = "all";

  const code = q ? normalizeAppointmentCode(q) : null;
  if (code && /^t-/i.test(q.trim())) {
    mode = "code";
    conds.push(sql`${patients.id} in (select patient_id from appointments where code = ${code})`);
  } else if (q.includes("@")) {
    mode = "email";
    conds.push(eq(patients.emailHash, blindIndex("email", normalizeEmail(q))));
  } else if (q.replace(/\D/g, "").length >= 6 && !/\p{L}/u.test(q)) {
    mode = "phone";
    conds.push(eq(patients.phoneHash, blindIndex("phone", normalizePhone(q))));
  } else if (q) {
    mode = "name";
    conds.push(ilike(patients.nameKey, likePattern(normalizeName(q))));
  }

  const where = and(...conds);
  const [{ total }] = await db.select({ total: count() }).from(patients).where(where);
  const rows = await db
    .select({
      id: patients.id,
      fullName: patients.fullName,
      phoneLast4: patients.phoneLast4,
      hasEmail: sql<boolean>`${patients.emailEnc} is not null`,
      createdAt: patients.createdAt,
      appointmentCount: sql<number>`(select count(*)::int from appointments a where a.patient_id = ${patients.id})`,
    })
    .from(patients)
    .where(where)
    .orderBy(patients.fullName)
    .limit(limit)
    .offset(offset);
  return { rows, total, mode };
}

export async function getPatientDetail(db: Db, actor: Actor, id: string) {
  const [p] = await db.select().from(patients).where(and(eq(patients.id, id), isNull(patients.deletedAt)));
  if (!p) throw new DomainError("NOT_FOUND", "No encontramos ese paciente.");
  assertCan(actor, "read", "patients", p.clinicId);
  const history = await db
    .select({
      id: appointments.id,
      code: appointments.code,
      startsAt: appointments.startsAt,
      status: appointments.status,
      source: appointments.source,
      serviceName: services.name,
      locationName: locations.name,
      professionalFirst: professionals.firstName,
      professionalLast: professionals.lastName,
      professionalTitle: professionals.title,
    })
    .from(appointments)
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .innerJoin(locations, eq(locations.id, appointments.locationId))
    .innerJoin(professionals, eq(professionals.id, appointments.professionalId))
    .where(eq(appointments.patientId, id))
    .orderBy(desc(appointments.startsAt))
    .limit(100);
  return {
    id: p.id,
    clinicId: p.clinicId,
    fullName: p.fullName,
    phone: decrypt(p.phoneEnc),
    email: p.emailEnc ? decrypt(p.emailEnc) : null,
    consentAt: p.consentAt,
    createdAt: p.createdAt,
    history,
  };
}

export async function savePatient(db: Db, actor: Actor, clinicId: string, raw: AdminPatientInput, id?: string) {
  assertCan(actor, "write", "patients", clinicId);
  const input = AdminPatientInput.parse(raw);
  const phone = normalizePhone(input.phone);
  const email = input.email ? normalizeEmail(input.email) : null;
  const values = {
    fullName: input.fullName.replace(/\s+/g, " "),
    nameKey: normalizeName(input.fullName),
    phoneEnc: encrypt(phone),
    phoneHash: blindIndex("phone", phone),
    phoneLast4: phone.slice(-4),
    emailEnc: email ? encrypt(email) : null,
    emailHash: email ? blindIndex("email", email) : null,
  };
  try {
    if (id) {
      const [before] = await db.select().from(patients).where(and(eq(patients.id, id), isNull(patients.deletedAt)));
      if (!before || before.clinicId !== clinicId) throw new DomainError("NOT_FOUND", "No encontramos ese paciente.");
      await db.update(patients).set(values).where(eq(patients.id, id));
      await audit(db, actor, { action: "update", entity: "patient", entityId: id, clinicId });
      return id;
    }
    const [row] = await db.insert(patients).values({ ...values, clinicId }).returning({ id: patients.id });
    await audit(db, actor, { action: "create", entity: "patient", entityId: row.id, clinicId });
    return row.id;
  } catch (e) {
    if (pgErrorCode(e) === PG_UNIQUE_VIOLATION) {
      throw new DomainError("VALIDATION", "Ya existe un paciente con ese nombre y teléfono.");
    }
    throw e;
  }
}

export async function deletePatient(db: Db, actor: Actor, id: string) {
  const [p] = await db.select().from(patients).where(and(eq(patients.id, id), isNull(patients.deletedAt)));
  if (!p) throw new DomainError("NOT_FOUND", "No encontramos ese paciente.");
  assertCan(actor, "delete", "patients", p.clinicId);
  const [{ n }] = await db
    .select({ n: count() })
    .from(appointments)
    .where(and(eq(appointments.patientId, id), eq(appointments.status, "confirmed"), gt(appointments.startsAt, new Date())));
  if (n > 0) throw new DomainError("VALIDATION", `El paciente tiene ${n} turno(s) futuros. Cancelalos antes de darlo de baja.`);
  await db.update(patients).set({ deletedAt: new Date() }).where(eq(patients.id, id));
  await audit(db, actor, { action: "delete", entity: "patient", entityId: id, clinicId: p.clinicId });
}

/** Staff-entered patient: reuse it when phone + name already exist, else create (email optional). */
export async function findOrCreatePatientAdmin(db: Db, actor: Actor, clinicId: string, raw: AdminPatientInput): Promise<string> {
  assertCan(actor, "write", "patients", clinicId);
  const input = AdminPatientInput.parse(raw);
  const phoneHash = blindIndex("phone", normalizePhone(input.phone));
  const [hit] = await db
    .select({ id: patients.id, emailEnc: patients.emailEnc })
    .from(patients)
    .where(and(eq(patients.clinicId, clinicId), eq(patients.phoneHash, phoneHash), eq(patients.nameKey, normalizeName(input.fullName))));
  if (hit) {
    if (input.email) {
      const email = normalizeEmail(input.email);
      await db.update(patients).set({ emailEnc: encrypt(email), emailHash: blindIndex("email", email), deletedAt: null }).where(eq(patients.id, hit.id));
    }
    return hit.id;
  }
  return savePatient(db, actor, clinicId, input);
}
