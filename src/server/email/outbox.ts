/**
 * Email outbox: queue appointment emails inside the caller's transaction.
 *
 * The message is rendered right away (so it reflects the state at the moment
 * of the change) and stored encrypted; the background job sends it with
 * retries (see ./worker.ts). If the patient has no email, nothing is queued.
 */
import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import {
  appointments,
  clinics,
  emailOutbox,
  locations,
  patients,
  professionals,
  services,
  settings,
  specialties,
  type EmailKind,
} from "@/db/schema";
import { buildIcs } from "@/lib/ics";
import { decrypt, encrypt } from "@/lib/pii";
import { formatDateTime, formatShortDateTime } from "@/lib/time";
import { renderAppointmentEmail, type AppointmentEmailData } from "./templates";

export type EmailAttachment = { filename: string; content: string; contentType: string };
export type EmailPayload = { to: string; subject: string; html: string; text: string; attachments?: EmailAttachment[] };

const HOUR = 3_600_000;

export function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export type EnqueueOptions = {
  /** Plain cancel token, only known right after booking: makes the link one-click. */
  cancelToken?: string | null;
  previousStartsAt?: Date | null;
  cancelledBy?: "patient" | "clinic";
  now?: Date;
};

/** Queue one email about an appointment. Returns the outbox id, or null if the patient has no email. */
export async function enqueueAppointmentEmail(db: DbOrTx, appointmentId: string, kind: EmailKind, opts: EnqueueOptions = {}) {
  const now = opts.now ?? new Date();
  const [row] = await db
    .select({
      a: appointments,
      emailEnc: patients.emailEnc,
      fullName: patients.fullName,
      pTitle: professionals.title,
      pFirst: professionals.firstName,
      pLast: professionals.lastName,
      serviceName: services.name,
      specialtyName: specialties.name,
      loc: { name: locations.name, address: locations.address, city: locations.city, notes: locations.notes },
      clinicName: clinics.name,
      clinicSlug: clinics.slug,
      clinicPhone: clinics.phone,
      clinicEmail: clinics.email,
      tz: clinics.timezone,
      st: { cancelMinHours: settings.cancelMinHours, contactPhone: settings.contactPhone, contactEmail: settings.contactEmail },
    })
    .from(appointments)
    .innerJoin(patients, eq(patients.id, appointments.patientId))
    .innerJoin(professionals, eq(professionals.id, appointments.professionalId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .leftJoin(specialties, eq(specialties.id, appointments.specialtyId))
    .innerJoin(locations, eq(locations.id, appointments.locationId))
    .innerJoin(clinics, eq(clinics.id, appointments.clinicId))
    .leftJoin(settings, eq(settings.clinicId, appointments.clinicId))
    .where(eq(appointments.id, appointmentId));
  if (!row || !row.emailEnc) return null;

  const a = row.a;
  const tz = row.tz;
  const base = appUrl();
  const professional = [row.pTitle, row.pFirst, row.pLast].filter(Boolean).join(" ");
  const minHours = row.st?.cancelMinHours ?? 24;
  const deadline = new Date(a.startsAt.getTime() - minHours * HOUR);
  const manageUrl = `${base}/turno/${a.code}${opts.cancelToken ? `?t=${encodeURIComponent(opts.cancelToken)}` : ""}`;
  const rebookUrl =
    `${base}/reservar?clinica=${encodeURIComponent(row.clinicSlug)}&sede=${a.locationId}` +
    (a.specialtyId ? `&especialidad=${a.specialtyId}&profesional=${a.professionalId}&consulta=${a.serviceId}` : "");

  const data: AppointmentEmailData = {
    kind,
    clinic: { name: row.clinicName, phone: row.st?.contactPhone ?? row.clinicPhone, email: row.st?.contactEmail ?? row.clinicEmail },
    patientFirstName: row.fullName.split(" ")[0] ?? row.fullName,
    code: a.code,
    when: formatDateTime(a.startsAt, tz),
    shortWhen: formatShortDateTime(a.startsAt, tz),
    previousWhen: opts.previousStartsAt ? formatDateTime(opts.previousStartsAt, tz) : null,
    professional,
    specialty: row.specialtyName,
    service: row.serviceName,
    location: row.loc,
    manageUrl,
    rebookUrl,
    cancelledBy: opts.cancelledBy,
    cancelDeadline: `hasta el ${formatDateTime(deadline, tz)}`,
    canStillCancel: a.status === "confirmed" && now.getTime() <= deadline.getTime(),
    privacyUrl: `${base}/privacidad`,
  };
  const rendered = renderAppointmentEmail(data);

  const attachments: EmailAttachment[] = [];
  if (kind !== "reminder") {
    attachments.push({
      filename: `turno-${a.code}.ics`,
      contentType: "text/calendar; charset=utf-8",
      content: buildIcs({
        uid: `${a.code}@${new URL(base).host}`,
        start: a.startsAt,
        end: a.endsAt,
        summary: `Turno: ${row.specialtyName ?? row.serviceName}, ${professional}`,
        description: `Código ${a.code}. ${row.serviceName}. Llegá 10 minutos antes con tu DNI.`,
        location: `${row.loc.name}, ${row.loc.address}`,
        url: `${base}/turno/${a.code}`,
        cancelled: kind === "cancellation",
        stamp: now,
      }),
    });
  }

  const payload: EmailPayload = { to: decrypt(row.emailEnc), ...rendered, attachments };
  const [queued] = await db
    .insert(emailOutbox)
    .values({
      clinicId: a.clinicId,
      appointmentId: a.id,
      kind,
      payloadEnc: encrypt(JSON.stringify(payload)),
      // The subject carries the date and the professional, never patient data.
      subjectPreview: rendered.subject,
      nextAttemptAt: now,
      createdAt: now,
    })
    .returning({ id: emailOutbox.id });
  return queued.id;
}

export function decodePayload(payloadEnc: string): EmailPayload {
  return JSON.parse(decrypt(payloadEnc)) as EmailPayload;
}
