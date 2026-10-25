import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { DbOrTx } from "@/db/client";
import { patients } from "@/db/schema";
import {
  blindIndex,
  decrypt,
  encrypt,
  isPlausiblePhone,
  normalizeEmail,
  normalizeName,
  normalizePhone,
} from "@/lib/pii";

export const CONSENT_VERSION = "2026-10";

export const PatientInput = z.object({
  fullName: z
    .string()
    .trim()
    .min(3, "Ingresá nombre y apellido.")
    .max(120)
    .refine((v) => /\p{L}/u.test(v), "Ingresá un nombre válido."),
  phone: z.string().trim().max(40).refine(isPlausiblePhone, "Ingresá un teléfono válido, con código de área."),
  email: z.string().trim().max(200).email("Ingresá un email válido."),
});
export type PatientInput = z.infer<typeof PatientInput>;

export type PatientRow = typeof patients.$inferSelect;

/**
 * Find the patient by (clinic, phone, normalized name) or create it.
 * Different people sharing a phone (family) end up as different patients.
 *
 * `refreshContact` (staff only) overwrites the stored email with the one
 * typed now. Public bookings never do: knowing someone's phone and name is
 * not proof of identity, and the email is a second factor to view or cancel
 * appointments. A public booking for an existing patient keeps their email.
 */
export async function upsertPatient(
  db: DbOrTx,
  clinicId: string,
  input: PatientInput,
  consentAt: Date | null,
  opts: { refreshContact?: boolean } = {},
): Promise<PatientRow> {
  const p = PatientInput.parse(input);
  const phone = normalizePhone(p.phone);
  const email = normalizeEmail(p.email);
  const values = {
    clinicId,
    fullName: p.fullName.replace(/\s+/g, " "),
    nameKey: normalizeName(p.fullName),
    phoneEnc: encrypt(phone),
    phoneHash: blindIndex("phone", phone),
    phoneLast4: phone.slice(-4),
    emailEnc: encrypt(email),
    emailHash: blindIndex("email", email),
    ...(consentAt ? { consentAt, consentVersion: CONSENT_VERSION } : {}),
  };
  const [row] = await db
    .insert(patients)
    .values(values)
    .onConflictDoUpdate({
      target: [patients.clinicId, patients.phoneHash, patients.nameKey],
      set: {
        ...(opts.refreshContact ? { fullName: values.fullName, emailEnc: values.emailEnc, emailHash: values.emailHash } : {}),
        deletedAt: null,
        ...(consentAt ? { consentAt, consentVersion: CONSENT_VERSION } : {}),
      },
    })
    .returning();
  return row;
}

export type PatientContact = { fullName: string; phone: string; email: string | null };

export function decryptPatient(p: PatientRow): PatientContact {
  return {
    fullName: p.fullName,
    phone: decrypt(p.phoneEnc),
    email: p.emailEnc ? decrypt(p.emailEnc) : null,
  };
}

export async function findPatientsByPhone(db: DbOrTx, clinicId: string, phone: string) {
  return db
    .select()
    .from(patients)
    .where(
      and(
        eq(patients.clinicId, clinicId),
        eq(patients.phoneHash, blindIndex("phone", normalizePhone(phone))),
        isNull(patients.deletedAt),
      ),
    );
}
