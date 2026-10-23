import { z } from "zod";
import type { Db } from "@/db/client";
import { and, eq, isNull } from "drizzle-orm";
import { appointmentEvents, appointments, patients, type AppointmentSource } from "@/db/schema";
import { generateAppointmentCode, generateCancelToken, hashToken } from "@/lib/codes";
import { getAvailableSlots, loadBookingContext } from "@/server/availability/service";
import {
  DomainError,
  PG_DEADLOCK,
  PG_EXCLUSION_VIOLATION,
  PG_SERIALIZATION_FAILURE,
  PG_UNIQUE_VIOLATION,
  pgConstraint,
  pgErrorCode,
} from "@/server/errors";
import { PatientInput, upsertPatient } from "@/server/patients/service";
import { lockProfessionalAgenda } from "./lock";

export const CreateAppointmentInput = z.object({
  professionalId: z.string().uuid(),
  locationId: z.string().uuid(),
  serviceId: z.string().uuid(),
  startsAt: z.coerce.date(),
  /** New or returning patient (find-or-create by phone + name). */
  patient: PatientInput.optional(),
  /** Existing patient — admin bookings only. */
  patientId: z.string().uuid().optional(),
  consent: z.boolean(),
  notes: z.string().max(1000).optional(),
}).refine((v) => !!v.patient !== !!v.patientId, { message: "Indicá los datos del paciente.", path: ["patient"] });
export type CreateAppointmentInput = z.input<typeof CreateAppointmentInput>;

const MAX_ATTEMPTS = 5;

export type CreateAppointmentOptions = {
  source: AppointmentSource;
  now?: Date;
  /** Admin/staff bookings may skip the patient-facing availability rules (lead time, horizon). */
  actorUserId?: string | null;
  conversationId?: string | null;
  /** Admin only: allow booking outside the published grid (still never overlapping). */
  allowOutsideGrid?: boolean;
};

export type CreatedAppointment = {
  appointment: typeof appointments.$inferSelect;
  /** Plain cancel token — only available right now, never stored. */
  cancelToken: string;
};

/**
 * The single entry point to book an appointment (form, assistant and admin).
 *
 * Re-validates everything on the server inside one transaction:
 * the slot must be returned by the availability engine right now, and the
 * database exclusion constraint guarantees no double booking under concurrency.
 */
export async function createAppointment(
  db: Db,
  rawInput: CreateAppointmentInput,
  opts: CreateAppointmentOptions,
): Promise<CreatedAppointment> {
  const input = CreateAppointmentInput.parse(rawInput);
  const now = opts.now ?? new Date();
  const isPatientFacing = opts.source !== "admin";

  if (input.patientId && isPatientFacing) {
    throw new DomainError("FORBIDDEN", "Operación no permitida.");
  }
  if (isPatientFacing && !input.consent) {
    throw new DomainError("VALIDATION", "Necesitamos tu consentimiento para guardar tus datos y reservar el turno.");
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const cancelToken = generateCancelToken();
    try {
      const appointment = await db.transaction(async (tx) => {
        await lockProfessionalAgenda(tx, input.professionalId);
        const bc = await loadBookingContext(tx, input);
        const endsAt = new Date(input.startsAt.getTime() + bc.service.durationMinutes * 60_000);

        if (!opts.allowOutsideGrid) {
          const { slots } = await getAvailableSlots(
            tx,
            {
              professionalId: input.professionalId,
              serviceId: input.serviceId,
              locationId: input.locationId,
              from: input.startsAt,
              to: new Date(input.startsAt.getTime() + 60_000),
            },
            now,
            { staff: !isPatientFacing },
          );
          const ok = slots.some(
            (s) => s.startsAt.getTime() === input.startsAt.getTime() && s.locationId === input.locationId,
          );
          if (!ok) {
            throw new DomainError(
              "SLOT_UNAVAILABLE",
              "Ese horario ya no está disponible. Elegí otro, por favor.",
            );
          }
        }

        let patientId: string;
        if (input.patientId) {
          const [p] = await tx
            .select({ id: patients.id })
            .from(patients)
            .where(and(eq(patients.id, input.patientId), eq(patients.clinicId, bc.clinic.id), isNull(patients.deletedAt)));
          if (!p) throw new DomainError("NOT_FOUND", "No encontramos ese paciente.");
          patientId = p.id;
        } else {
          patientId = (await upsertPatient(tx, bc.clinic.id, input.patient!, input.consent ? now : null)).id;
        }

        const [row] = await tx
          .insert(appointments)
          .values({
            clinicId: bc.clinic.id,
            locationId: input.locationId,
            professionalId: input.professionalId,
            specialtyId: bc.service.specialtyId,
            serviceId: input.serviceId,
            patientId,
            code: generateAppointmentCode(),
            cancelTokenHash: hashToken(cancelToken),
            startsAt: input.startsAt,
            endsAt,
            status: "confirmed",
            source: opts.source,
            notes: input.notes,
            createdByUserId: opts.actorUserId ?? null,
            conversationId: opts.conversationId ?? null,
          })
          .returning();

        await tx.insert(appointmentEvents).values({
          appointmentId: row.id,
          type: "created",
          actor: opts.source === "admin" ? "admin" : opts.source === "ai" ? "ai" : "patient",
          actorUserId: opts.actorUserId ?? null,
          data: { source: opts.source, startsAt: row.startsAt.toISOString() },
        });
        return row;
      });
      return { appointment, cancelToken };
    } catch (err) {
      const code = pgErrorCode(err);
      if (code === PG_EXCLUSION_VIOLATION) {
        throw new DomainError("SLOT_TAKEN", "Uy, alguien acaba de tomar ese horario. Elegí otro, por favor.");
      }
      if (code === PG_UNIQUE_VIOLATION && pgConstraint(err)?.includes("code")) {
        continue; // appointment code collision: retry with a new code
      }
      if (code === PG_DEADLOCK || code === PG_SERIALIZATION_FAILURE) {
        // Concurrent inserts on the same slot can deadlock while checking the
        // exclusion constraint. Postgres aborts one of them: retry it, and the
        // availability re-check then reports the slot as taken.
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise((r) => setTimeout(r, 10 + Math.random() * 40));
          continue;
        }
        throw new DomainError("SLOT_TAKEN", "Uy, alguien acaba de tomar ese horario. Elegí otro, por favor.");
      }
      throw err;
    }
  }
  throw new Error("Could not generate a unique appointment code");
}
