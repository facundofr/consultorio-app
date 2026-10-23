import { and, eq, lt } from "drizzle-orm";
import { z } from "zod";
import type { Db, Tx } from "@/db/client";
import { appointmentEvents, appointments, type AppointmentStatus } from "@/db/schema";
import { getAvailableSlots, loadBookingContext } from "@/server/availability/service";
import { getClinicContext } from "@/server/clinics/settings";
import { DomainError, PG_EXCLUSION_VIOLATION, pgErrorCode } from "@/server/errors";
import { lockProfessionalAgenda } from "./lock";

export type AppointmentRow = typeof appointments.$inferSelect;

const HOUR = 3_600_000;

/* --------------------------- Cancellation rule ---------------------------- */

export type CancelCheck =
  | { ok: true; deadline: Date }
  | { ok: false; reason: "ALREADY_CANCELLED" | "NOT_CANCELLABLE" | "CANCEL_WINDOW_PASSED"; deadline: Date };

/**
 * The patient may cancel while `now <= startsAt − minHours`.
 * Exactly at the limit (24 h 00 m 00 s before) is still allowed; one second
 * later it is not. Always evaluated with the server clock.
 */
export function checkPatientCancellation(
  appt: Pick<AppointmentRow, "status" | "startsAt">,
  cancelMinHours: number,
  now: Date,
): CancelCheck {
  const deadline = new Date(appt.startsAt.getTime() - cancelMinHours * HOUR);
  if (appt.status === "cancelled_by_patient" || appt.status === "cancelled_by_admin") {
    return { ok: false, reason: "ALREADY_CANCELLED", deadline };
  }
  if (appt.status !== "confirmed") return { ok: false, reason: "NOT_CANCELLABLE", deadline };
  if (now.getTime() > deadline.getTime()) return { ok: false, reason: "CANCEL_WINDOW_PASSED", deadline };
  return { ok: true, deadline };
}

async function lockAppointment(tx: Tx, id: string): Promise<AppointmentRow> {
  const [row] = await tx.select().from(appointments).where(eq(appointments.id, id)).for("update");
  if (!row) throw new DomainError("NOT_FOUND", "No encontramos ese turno.");
  return row;
}

export type CancelBy =
  | { kind: "patient"; channel: "link" | "chat" | "form" }
  | { kind: "admin"; userId: string; reason?: string | null };

/**
 * Cancel an appointment inside a transaction with a row lock, so two
 * simultaneous cancellations cannot both succeed and the window rule is
 * evaluated against the committed state.
 */
export async function cancelAppointment(db: Db, appointmentId: string, by: CancelBy, now: Date = new Date()): Promise<AppointmentRow> {
  return db.transaction(async (tx) => {
    const appt = await lockAppointment(tx, appointmentId);
    if (by.kind === "patient") {
      const { settings } = await getClinicContext(tx, appt.clinicId);
      const check = checkPatientCancellation(appt, settings.cancelMinHours, now);
      if (!check.ok) {
        if (check.reason === "ALREADY_CANCELLED") throw new DomainError("ALREADY_CANCELLED", "Este turno ya estaba cancelado.");
        if (check.reason === "NOT_CANCELLABLE") throw new DomainError("NOT_CANCELLABLE", "Este turno ya no se puede cancelar.");
        const phone = settings.contactPhone ? ` Llamanos al ${settings.contactPhone}.` : "";
        throw new DomainError("CANCEL_WINDOW_PASSED", `${settings.outOfWindowMessage}${phone}`, {
          contactPhone: settings.contactPhone,
          deadline: check.deadline.toISOString(),
        });
      }
    } else if (appt.status !== "confirmed") {
      throw new DomainError(
        appt.status.startsWith("cancelled") ? "ALREADY_CANCELLED" : "NOT_CANCELLABLE",
        appt.status.startsWith("cancelled") ? "Este turno ya estaba cancelado." : "Solo se pueden cancelar turnos confirmados.",
      );
    }

    const status: AppointmentStatus = by.kind === "patient" ? "cancelled_by_patient" : "cancelled_by_admin";
    const [row] = await tx
      .update(appointments)
      .set({ status, cancelledAt: now, cancelReason: by.kind === "admin" ? (by.reason ?? null) : null })
      .where(eq(appointments.id, appointmentId))
      .returning();
    await tx.insert(appointmentEvents).values({
      appointmentId,
      type: "cancelled",
      actor: by.kind === "admin" ? "admin" : "patient",
      actorUserId: by.kind === "admin" ? by.userId : null,
      data: by.kind === "patient" ? { channel: by.channel } : { reason: by.reason ?? null },
    });
    return row;
  });
}

/* ------------------------------- Reschedule ------------------------------- */

export const RescheduleInput = z.object({
  startsAt: z.coerce.date(),
  professionalId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  /** Admin override: allow outside the published grid (never overlapping). */
  force: z.boolean().optional(),
});
export type RescheduleInput = z.input<typeof RescheduleInput>;

export async function rescheduleAppointment(
  db: Db,
  appointmentId: string,
  raw: RescheduleInput,
  by: { userId: string },
  now: Date = new Date(),
): Promise<AppointmentRow> {
  const input = RescheduleInput.parse(raw);
  try {
    return await db.transaction(async (tx) => {
      const appt = await lockAppointment(tx, appointmentId);
      if (appt.status !== "confirmed") throw new DomainError("NOT_CANCELLABLE", "Solo se pueden mover turnos confirmados.");
      const target = {
        professionalId: input.professionalId ?? appt.professionalId,
        locationId: input.locationId ?? appt.locationId,
        serviceId: input.serviceId ?? appt.serviceId,
      };
      await lockProfessionalAgenda(tx, target.professionalId);
      const bc = await loadBookingContext(tx, target);
      if (bc.clinic.id !== appt.clinicId) throw new DomainError("FORBIDDEN", "No se puede mover a otra clínica.");
      if (!bc.locationIds.includes(target.locationId)) throw new DomainError("VALIDATION", "Ese profesional no atiende en esa sede.");

      if (!input.force) {
        const { slots } = await getAvailableSlots(
          tx,
          { ...target, from: input.startsAt, to: new Date(input.startsAt.getTime() + 60_000) },
          now,
          { staff: true, excludeAppointmentId: appt.id },
        );
        if (!slots.some((s) => s.startsAt.getTime() === input.startsAt.getTime() && s.locationId === target.locationId)) {
          throw new DomainError("SLOT_UNAVAILABLE", "Ese horario no está disponible.");
        }
      }
      const endsAt = new Date(input.startsAt.getTime() + bc.service.durationMinutes * 60_000);
      const [row] = await tx
        .update(appointments)
        .set({
          ...target,
          specialtyId: bc.service.specialtyId,
          startsAt: input.startsAt,
          endsAt,
          // A new time deserves a new reminder.
          reminderSentAt: null,
        })
        .where(eq(appointments.id, appt.id))
        .returning();
      await tx.insert(appointmentEvents).values({
        appointmentId: appt.id,
        type: "rescheduled",
        actor: "admin",
        actorUserId: by.userId,
        data: {
          from: { startsAt: appt.startsAt.toISOString(), professionalId: appt.professionalId, locationId: appt.locationId },
          to: { startsAt: row.startsAt.toISOString(), professionalId: row.professionalId, locationId: row.locationId },
          forced: !!input.force,
        },
      });
      return row;
    });
  } catch (e) {
    if (pgErrorCode(e) === PG_EXCLUSION_VIOLATION) {
      throw new DomainError("SLOT_TAKEN", "Ese horario se superpone con otro turno del profesional.");
    }
    throw e;
  }
}

/* --------------------------------- Status --------------------------------- */

const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  confirmed: ["completed", "no_show"],
  completed: ["confirmed", "no_show"],
  no_show: ["confirmed", "completed"],
  cancelled_by_patient: [],
  cancelled_by_admin: [],
};

export async function setAppointmentStatus(
  db: Db,
  appointmentId: string,
  status: "confirmed" | "completed" | "no_show",
  by: { userId: string },
): Promise<AppointmentRow> {
  return db.transaction(async (tx) => {
    const appt = await lockAppointment(tx, appointmentId);
    if (appt.status === status) return appt;
    if (!TRANSITIONS[appt.status].includes(status)) {
      throw new DomainError("VALIDATION", "No se puede cambiar el estado de un turno cancelado. Creá uno nuevo.");
    }
    const [row] = await tx.update(appointments).set({ status }).where(eq(appointments.id, appt.id)).returning();
    await tx.insert(appointmentEvents).values({
      appointmentId: appt.id,
      type: "status_changed",
      actor: "admin",
      actorUserId: by.userId,
      data: { from: appt.status, to: status },
    });
    return row;
  });
}

/** Mark past confirmed appointments as completed (housekeeping, used by jobs). */
export async function completePastAppointments(db: Db, now: Date = new Date()) {
  const rows = await db
    .update(appointments)
    .set({ status: "completed" })
    .where(and(eq(appointments.status, "confirmed"), lt(appointments.endsAt, now)))
    .returning({ id: appointments.id });
  return rows.length;
}
