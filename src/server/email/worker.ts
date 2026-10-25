/**
 * Background email jobs: send the outbox, queue reminders, purge old content.
 * Safe to run on several instances at once: rows are claimed with
 * FOR UPDATE SKIP LOCKED (outbox) or a conditional update (reminders).
 */
import { and, asc, eq, gt, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import nodemailer from "nodemailer";
import type { Db } from "@/db/client";
import { appointmentEvents, appointments, emailOutbox, settings } from "@/db/schema";
import { decodePayload, enqueueAppointmentEmail, type EmailPayload } from "./outbox";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** Waits between attempts: 1 min, 5 min, 30 min, 2 h, 6 h, then give up. */
const BACKOFF_MINUTES = [1, 5, 30, 120, 360];
export const MAX_ATTEMPTS = BACKOFF_MINUTES.length + 1;
const BATCH = 20;
/** Preview and failed messages keep their content this long (for the panel), then it is wiped. */
const KEEP_CONTENT_DAYS = 7;
/** Outbox metadata (no content) is kept this long. */
const KEEP_ROWS_DAYS = 180;

export type Sender = (msg: EmailPayload) => Promise<void>;

export type MailConfig = { mode: "smtp"; from: string; send: Sender } | { mode: "preview" };

let cachedConfig: MailConfig | undefined;

/** SMTP from environment, or "preview" (test inbox in the panel) when SMTP_HOST is empty. */
export function mailConfig(env: Record<string, string | undefined> = process.env): MailConfig {
  if (env === process.env && cachedConfig) return cachedConfig;
  let cfg: MailConfig;
  if (!env.SMTP_HOST) {
    cfg = { mode: "preview" };
  } else {
    const port = Number(env.SMTP_PORT || 587);
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port,
      secure: env.SMTP_SECURE ? env.SMTP_SECURE === "true" || env.SMTP_SECURE === "1" : port === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" } : undefined,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });
    const from = env.MAIL_FROM || env.SMTP_USER || "turnos@localhost";
    cfg = {
      mode: "smtp",
      from,
      send: async (m) => {
        await transport.sendMail({
          from,
          to: m.to,
          subject: m.subject,
          html: m.html,
          text: m.text,
          attachments: m.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
        });
      },
    };
  }
  if (env === process.env) cachedConfig = cfg;
  return cfg;
}

/** Error text without email addresses (SMTP errors often echo the recipient). */
export function safeError(e: unknown): string {
  const raw = e instanceof Error ? `${(e as { code?: string }).code ?? e.name}: ${e.message}` : "unknown error";
  return raw.replace(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+/gu, "[email]").slice(0, 300);
}

/** Send what is due. Returns how many were sent, kept as preview, retried and failed. */
export async function flushOutbox(db: Db, opts: { now?: Date; config?: MailConfig } = {}) {
  const now = opts.now ?? new Date();
  const cfg = opts.config ?? mailConfig();
  const result = { sent: 0, preview: 0, retry: 0, failed: 0 };

  // Claim a batch. "sending" rows whose lease expired (a crashed worker) are picked up again.
  const due = db
    .select({ id: emailOutbox.id })
    .from(emailOutbox)
    .where(and(inArray(emailOutbox.status, ["pending", "sending"]), lte(emailOutbox.nextAttemptAt, now)))
    .orderBy(asc(emailOutbox.nextAttemptAt))
    .limit(BATCH)
    .for("update", { skipLocked: true });
  const claimed = await db
    .update(emailOutbox)
    .set({ status: "sending", attempts: sql`${emailOutbox.attempts} + 1`, nextAttemptAt: new Date(now.getTime() + 10 * MINUTE) })
    .where(inArray(emailOutbox.id, due))
    .returning();

  for (const row of claimed) {
    if (!row.payloadEnc) {
      await db.update(emailOutbox).set({ status: "failed", lastError: "no content" }).where(eq(emailOutbox.id, row.id));
      result.failed++;
      continue;
    }
    try {
      if (cfg.mode === "preview") {
        await db.update(emailOutbox).set({ status: "preview", sentAt: now, lastError: null }).where(eq(emailOutbox.id, row.id));
        result.preview++;
      } else {
        await cfg.send(decodePayload(row.payloadEnc));
        // Delivered: the content (recipient, link with token) is no longer needed.
        await db.update(emailOutbox).set({ status: "sent", sentAt: now, payloadEnc: null, lastError: null }).where(eq(emailOutbox.id, row.id));
        result.sent++;
      }
      if (row.appointmentId) {
        await db.insert(appointmentEvents).values({
          appointmentId: row.appointmentId,
          type: "email_sent",
          actor: "system",
          data: { kind: row.kind, ...(cfg.mode === "preview" ? { preview: true } : {}) },
        });
      }
    } catch (e) {
      const giveUp = row.attempts >= MAX_ATTEMPTS;
      const wait = BACKOFF_MINUTES[Math.min(row.attempts - 1, BACKOFF_MINUTES.length - 1)];
      await db
        .update(emailOutbox)
        .set({
          status: giveUp ? "failed" : "pending",
          lastError: safeError(e),
          nextAttemptAt: new Date(now.getTime() + wait * MINUTE),
        })
        .where(eq(emailOutbox.id, row.id));
      if (giveUp) result.failed++;
      else result.retry++;
    }
  }
  return result;
}

/**
 * Queue reminders for confirmed appointments that start within each clinic's
 * "reminder hours". Appointments booked (or moved) after the reminder point
 * already got a fresh confirmation, so they are marked without a new email.
 */
export async function queueReminders(db: Db, now: Date = new Date()) {
  const candidates = await db
    .select({ id: appointments.id, startsAt: appointments.startsAt, reminderHours: settings.reminderHours })
    .from(appointments)
    .innerJoin(settings, eq(settings.clinicId, appointments.clinicId))
    .where(
      and(
        eq(appointments.status, "confirmed"),
        isNull(appointments.reminderSentAt),
        gt(appointments.startsAt, now),
        lte(appointments.startsAt, sql`${now.toISOString()}::timestamptz + make_interval(hours => ${settings.reminderHours})`),
      ),
    )
    .orderBy(asc(appointments.startsAt))
    .limit(200);

  let queued = 0;
  let skipped = 0;
  for (const c of candidates) {
    await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(appointments)
        .set({ reminderSentAt: now })
        .where(and(eq(appointments.id, c.id), isNull(appointments.reminderSentAt), eq(appointments.status, "confirmed")))
        .returning({ id: appointments.id });
      if (!claimed) return; // another worker got it
      const reminderPoint = new Date(c.startsAt.getTime() - c.reminderHours * HOUR);
      const [lastChange] = await tx
        .select({ at: sql<Date>`max(${appointmentEvents.createdAt})` })
        .from(appointmentEvents)
        .where(and(eq(appointmentEvents.appointmentId, c.id), or(eq(appointmentEvents.type, "created"), eq(appointmentEvents.type, "rescheduled"))));
      const changedAt = lastChange?.at ? new Date(lastChange.at) : null;
      if (changedAt && changedAt.getTime() >= reminderPoint.getTime()) {
        skipped++;
        return;
      }
      const id = await enqueueAppointmentEmail(tx, c.id, "reminder", { now });
      await tx.insert(appointmentEvents).values({ appointmentId: c.id, type: "reminder_sent", actor: "system", data: { queued: !!id } });
      if (id) queued++;
      else skipped++;
    });
  }
  return { queued, skipped };
}

/** Wipe old preview/failed content and drop old outbox rows. */
export async function purgeOutbox(db: Db, now: Date = new Date()) {
  const contentCutoff = new Date(now.getTime() - KEEP_CONTENT_DAYS * 24 * HOUR);
  const rowsCutoff = new Date(now.getTime() - KEEP_ROWS_DAYS * 24 * HOUR);
  const wiped = await db
    .update(emailOutbox)
    .set({ payloadEnc: null })
    .where(and(inArray(emailOutbox.status, ["preview", "failed"]), lt(emailOutbox.createdAt, contentCutoff), sql`${emailOutbox.payloadEnc} is not null`))
    .returning({ id: emailOutbox.id });
  const deleted = await db.delete(emailOutbox).where(lt(emailOutbox.createdAt, rowsCutoff)).returning({ id: emailOutbox.id });
  return { wiped: wiped.length, deleted: deleted.length };
}
