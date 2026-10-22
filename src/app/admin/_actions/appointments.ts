"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { professionals } from "@/db/schema";
import { addDays, localDateTimeToUtc, localToUtc } from "@/lib/time";
import {
  adminCancelAppointment,
  adminCreateAppointment,
  adminRescheduleAppointment,
  adminSetAppointmentStatus,
} from "@/server/admin/appointments";
import { findOrCreatePatientAdmin, searchPatients } from "@/server/admin/patients";
import { getAvailableSlots } from "@/server/availability/service";
import { assertCan, can } from "@/server/auth/rbac";
import { getClinicContext } from "@/server/clinics/settings";
import { isDomainError } from "@/server/errors";
import { adminContext } from "../_lib/context";
import { runSimple } from "../_lib/action";

export type SlotOption = { startsAt: string; localTime: string; locationId: string };

const SlotsQuery = z.object({
  professionalId: z.string().uuid(),
  serviceId: z.string().uuid(),
  locationId: z.string().uuid().nullish(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  excludeAppointmentId: z.string().uuid().optional(),
});

/** Real free slots for one day, for staff (no lead time / horizon limits). */
export async function staffSlotsAction(raw: z.input<typeof SlotsQuery>): Promise<{ ok: boolean; slots: SlotOption[]; message?: string }> {
  const { db, actor, clinicId } = await adminContext();
  try {
    assertCan(actor, "read", "appointments", clinicId);
    const q = SlotsQuery.parse(raw);
    const [prof] = await db.select({ id: professionals.id }).from(professionals).where(and(eq(professionals.id, q.professionalId), eq(professionals.clinicId, clinicId)));
    if (!prof) return { ok: false, slots: [], message: "Profesional inválido." };
    const { clinic } = await getClinicContext(db, clinicId);
    const r = await getAvailableSlots(
      db,
      { professionalId: q.professionalId, serviceId: q.serviceId, locationId: q.locationId ?? null, from: localToUtc(q.date, 0, clinic.timezone), to: localToUtc(addDays(q.date, 1), 0, clinic.timezone) },
      new Date(),
      { staff: true, excludeAppointmentId: q.excludeAppointmentId },
    );
    return { ok: true, slots: r.slots.map((s) => ({ startsAt: s.startsAt.toISOString(), localTime: s.localTime, locationId: s.locationId })) };
  } catch (e) {
    return { ok: false, slots: [], message: isDomainError(e) ? e.userMessage : "No pudimos cargar los horarios." };
  }
}

export async function findPatientsAction(q: string) {
  const { db, actor, clinicId } = await adminContext();
  if (!q || q.trim().length < 2) return [];
  const { rows } = await searchPatients(db, actor, clinicId, { q, limit: 8 });
  return rows.map((r) => ({ id: r.id, fullName: r.fullName, phoneLast4: r.phoneLast4 }));
}

const CreateInput = z.object({
  professionalId: z.string().uuid(),
  locationId: z.string().uuid(),
  serviceId: z.string().uuid(),
  startsAt: z.string().datetime().optional(),
  /** Forced booking: local date + time (admins only). */
  forceDate: z.string().optional(),
  forceTime: z.string().optional(),
  patientId: z.string().uuid().optional(),
  patient: z.object({ fullName: z.string(), phone: z.string(), email: z.string().optional() }).optional(),
  notes: z.string().max(1000).optional(),
});

export async function createAppointmentAdminAction(raw: z.input<typeof CreateInput>) {
  const { db, actor, clinicId } = await adminContext();
  let code: string | undefined;
  let id: string | undefined;
  const res = await runSimple(async () => {
    const input = CreateInput.parse(raw);
    const force = !!(input.forceDate && input.forceTime);
    if (force && !can(actor, "write", "schedules")) throw new Error("forbidden");
    const { clinic } = await getClinicContext(db, clinicId);
    const startsAt = force ? localDateTimeToUtc(input.forceDate!, input.forceTime!, clinic.timezone) : new Date(input.startsAt!);
    const patientId = input.patientId ?? (input.patient ? await findOrCreatePatientAdmin(db, actor, clinicId, input.patient) : undefined);
    const created = await adminCreateAppointment(
      db,
      actor,
      clinicId,
      {
        professionalId: input.professionalId,
        locationId: input.locationId,
        serviceId: input.serviceId,
        startsAt,
        patientId,
        consent: false,
        notes: input.notes,
      },
      { force },
    );
    code = created.appointment.code;
    id = created.appointment.id;
    return `Turno ${code} agendado.`;
  });
  if (res.ok) revalidatePath("/admin/agenda");
  return { ...res, code, id };
}

export async function rescheduleAction(id: string, raw: { startsAt?: string; professionalId?: string; locationId?: string; forceDate?: string; forceTime?: string }) {
  const { db, actor, clinicId } = await adminContext();
  const res = await runSimple(async () => {
    const force = !!(raw.forceDate && raw.forceTime);
    if (force && !can(actor, "write", "schedules")) throw new Error("forbidden");
    const { clinic } = await getClinicContext(db, clinicId);
    const startsAt = force ? localDateTimeToUtc(raw.forceDate!, raw.forceTime!, clinic.timezone) : new Date(raw.startsAt!);
    await adminRescheduleAppointment(db, actor, id, { startsAt, professionalId: raw.professionalId, locationId: raw.locationId, force });
    return "Turno movido.";
  });
  if (res.ok) {
    revalidatePath("/admin/agenda");
    revalidatePath(`/admin/turnos/${id}`);
  }
  return res;
}

export async function cancelAppointmentAdminAction(fd: FormData) {
  const { db, actor } = await adminContext();
  const id = String(fd.get("id"));
  const res = await runSimple(async () => {
    await adminCancelAppointment(db, actor, id, String(fd.get("reason") ?? "") || null);
    return "Turno cancelado. El horario quedó libre.";
  });
  if (res.ok) {
    revalidatePath("/admin/agenda");
    revalidatePath(`/admin/turnos/${id}`);
  }
  return res;
}

export async function setStatusAction(id: string, status: "confirmed" | "completed" | "no_show") {
  const { db, actor } = await adminContext();
  const res = await runSimple(async () => {
    await adminSetAppointmentStatus(db, actor, id, status);
    return status === "completed" ? "Marcado como atendido." : status === "no_show" ? "Marcado como ausente." : "Turno confirmado.";
  });
  if (res.ok) revalidatePath(`/admin/turnos/${id}`);
  return res;
}
