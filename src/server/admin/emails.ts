/**
 * Email outbox for the panel: delivery status per message, the test inbox
 * (when no SMTP is configured) and manual retry of failed messages.
 * Administration only: messages contain the patient's name and address.
 */
import { and, count, desc, eq, type SQL } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appointments, emailOutbox, emailStatus, type EmailKind, type EmailStatus } from "@/db/schema";
import { assertCan, type Actor } from "@/server/auth/rbac";
import { getClinicContext } from "@/server/clinics/settings";
import { DomainError } from "@/server/errors";
import { decodePayload } from "@/server/email/outbox";
import { mailConfig } from "@/server/email/worker";
import { audit } from "./audit";
import { pageParams } from "./common";

export const EMAIL_KIND_LABELS: Record<EmailKind, string> = {
  confirmation: "Confirmación",
  cancellation: "Cancelación",
  rescheduled: "Cambio de horario",
  reminder: "Recordatorio",
};

export const EMAIL_STATUS_LABELS: Record<EmailStatus, string> = {
  pending: "En cola",
  sending: "Enviando",
  sent: "Enviado",
  preview: "Bandeja de prueba",
  failed: "Falló",
};

export async function listEmails(db: Db, actor: Actor, clinicId: string, f: { status?: string }, page = 1) {
  assertCan(actor, "read", "emails", clinicId);
  const { clinic } = await getClinicContext(db, clinicId);
  const conds: SQL[] = [eq(emailOutbox.clinicId, clinicId)];
  if (f.status && (emailStatus.enumValues as readonly string[]).includes(f.status)) conds.push(eq(emailOutbox.status, f.status as EmailStatus));
  const where = and(...conds);
  const { limit, offset } = pageParams(page);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: emailOutbox.id,
        kind: emailOutbox.kind,
        status: emailOutbox.status,
        subject: emailOutbox.subjectPreview,
        attempts: emailOutbox.attempts,
        lastError: emailOutbox.lastError,
        createdAt: emailOutbox.createdAt,
        sentAt: emailOutbox.sentAt,
        hasContent: emailOutbox.payloadEnc,
        appointmentId: emailOutbox.appointmentId,
        appointmentCode: appointments.code,
      })
      .from(emailOutbox)
      .leftJoin(appointments, eq(appointments.id, emailOutbox.appointmentId))
      .where(where)
      .orderBy(desc(emailOutbox.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(emailOutbox).where(where),
  ]);
  return {
    timezone: clinic.timezone,
    mode: mailConfig().mode,
    total,
    rows: rows.map(({ hasContent, ...r }) => ({ ...r, hasContent: !!hasContent })),
  };
}

/** One message with its content (while it is still stored). Opening it is audited. */
export async function getEmail(db: Db, actor: Actor, id: string) {
  assertCan(actor, "read", "emails");
  const [row] = await db
    .select({ e: emailOutbox, appointmentCode: appointments.code })
    .from(emailOutbox)
    .leftJoin(appointments, eq(appointments.id, emailOutbox.appointmentId))
    .where(eq(emailOutbox.id, id));
  if (!row) throw new DomainError("NOT_FOUND", "No encontramos ese email.");
  assertCan(actor, "read", "emails", row.e.clinicId);
  const { clinic } = await getClinicContext(db, row.e.clinicId);
  const payload = row.e.payloadEnc ? decodePayload(row.e.payloadEnc) : null;
  if (payload) await audit(db, actor, { action: "email.viewed", entity: "email", entityId: id, clinicId: row.e.clinicId });
  const { payloadEnc: _p, ...meta } = row.e;
  void _p;
  return { ...meta, appointmentCode: row.appointmentCode, timezone: clinic.timezone, payload };
}

/** Put a failed message back in the queue (fresh attempts). */
export async function retryEmail(db: Db, actor: Actor, id: string) {
  const [row] = await db.select({ clinicId: emailOutbox.clinicId, status: emailOutbox.status, payloadEnc: emailOutbox.payloadEnc }).from(emailOutbox).where(eq(emailOutbox.id, id));
  if (!row) throw new DomainError("NOT_FOUND", "No encontramos ese email.");
  assertCan(actor, "write", "emails", row.clinicId);
  if (row.status !== "failed") throw new DomainError("VALIDATION", "Solo se pueden reintentar los emails que fallaron.");
  if (!row.payloadEnc) throw new DomainError("VALIDATION", "El contenido de este email ya se borró. No se puede reenviar.");
  await db.update(emailOutbox).set({ status: "pending", attempts: 0, nextAttemptAt: new Date(), lastError: null }).where(eq(emailOutbox.id, id));
  await audit(db, actor, { action: "email.retry", entity: "email", entityId: id, clinicId: row.clinicId });
}
