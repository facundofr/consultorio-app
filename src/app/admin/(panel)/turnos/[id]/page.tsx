import type { Metadata } from "next";
import Link from "next/link";
import type { Catalog } from "@/components/admin/agenda/types";
import { PageHeader, Section } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { serverNow } from "@/lib/clock";
import { utcToLocal } from "@/lib/time";
import { getAppointmentDetail, SOURCE_LABELS } from "@/server/admin/appointments";
import { listLocations, listServices } from "@/server/admin/catalog";
import { listProfessionals } from "@/server/admin/professionals";
import { can } from "@/server/auth/rbac";
import { adminContext } from "../../../_lib/context";
import { loadOr404 } from "../../../_lib/load";
import { AppointmentActions } from "./appointment-actions";

export const metadata: Metadata = { title: "Turno" };

const EVENT_LABELS: Record<string, string> = {
  created: "Turno creado",
  cancelled: "Turno cancelado",
  rescheduled: "Turno movido",
  status_changed: "Cambio de estado",
  reminder_sent: "Recordatorio en cola",
  email_sent: "Email enviado",
};
const ACTOR_LABELS: Record<string, string> = { patient: "el paciente", admin: "el equipo", system: "el sistema", ai: "el asistente" };

export default async function AppointmentPage({ params }: PageProps<"/admin/turnos/[id]">) {
  const { db, actor, clinicId } = await adminContext();
  const { id } = await params;
  const a = await loadOr404(() => getAppointmentDetail(db, actor, id));
  const [profs, locs, svcs] = await Promise.all([listProfessionals(db, actor, clinicId), listLocations(db, actor, clinicId), listServices(db, actor, clinicId)]);
  const catalog: Catalog = {
    professionals: profs.map((p) => ({ id: p.id, name: p.displayName, specialtyIds: p.specialties.map((s) => s.id), locationIds: p.locations.map((l) => l.id) })),
    services: svcs.map(({ service: s }) => ({ id: s.id, name: s.name, durationMinutes: s.durationMinutes, specialtyId: s.specialtyId })),
    locations: locs.map((l) => ({ id: l.id, name: l.name })),
  };
  const local = utcToLocal(a.startsAt, a.timezone);
  return (
    <>
      <PageHeader title={`Turno ${a.code}`} description={<span className="first-letter:uppercase">{a.when}</span>} />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <StatusBadge status={a.status} />
        <span className="text-sm text-muted-foreground">Reservado por {SOURCE_LABELS[a.source].toLowerCase()}</span>
      </div>
      {can(actor, "write", "appointments") ? (
        <div className="mb-8">
          <AppointmentActions
            catalog={catalog}
            canForce={can(actor, "write", "schedules")}
            appointment={{
              id: a.id,
              status: a.status,
              professionalId: a.professionalId,
              serviceId: a.serviceId,
              locationId: a.locationId,
              date: local.date,
              label: `${a.patientName}, ${a.serviceName}`,
              isPast: a.startsAt.getTime() < serverNow().getTime(),
            }}
          />
        </div>
      ) : null}
      <Section title="Consulta">
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <div><dt className="text-sm text-muted-foreground">Profesional</dt><dd className="font-semibold">{a.professionalName}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Especialidad y tipo</dt><dd className="font-semibold">{a.specialtyName ? `${a.specialtyName}, ` : ""}{a.serviceName}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Sede</dt><dd className="font-semibold">{a.locationName}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Horario</dt><dd className="font-semibold tabular-nums">{local.time} a {utcToLocal(a.endsAt, a.timezone).time}</dd></div>
          {a.notes ? <div className="sm:col-span-2"><dt className="text-sm text-muted-foreground">Nota interna</dt><dd>{a.notes}</dd></div> : null}
          {a.cancelReason ? <div className="sm:col-span-2"><dt className="text-sm text-muted-foreground">Motivo de cancelación</dt><dd>{a.cancelReason}</dd></div> : null}
        </dl>
      </Section>
      <Section title="Paciente">
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <div><dt className="text-sm text-muted-foreground">Nombre</dt><dd className="font-semibold"><Link href={`/admin/pacientes/${a.patientId}`} className="underline-offset-4 hover:underline">{a.patientName}</Link></dd></div>
          <div><dt className="text-sm text-muted-foreground">Teléfono</dt><dd className="font-semibold tabular-nums"><a href={`tel:${a.patientPhone}`} className="underline-offset-4 hover:underline">{a.patientPhone}</a></dd></div>
          <div><dt className="text-sm text-muted-foreground">Email</dt><dd className="font-semibold">{a.patientEmail ?? "—"}</dd></div>
        </dl>
      </Section>
      <Section title="Historial">
        <ol className="flex flex-col gap-3 border-l-2 border-border pl-4">
          {a.events.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full bg-primary" aria-hidden />
              <p className="font-semibold">{EVENT_LABELS[e.type] ?? e.type}</p>
              <p className="text-sm text-muted-foreground">
                {e.createdAt.toLocaleString("es-AR", { timeZone: a.timezone })}, por {e.userName ?? ACTOR_LABELS[e.actor] ?? e.actor}
              </p>
            </li>
          ))}
        </ol>
      </Section>
    </>
  );
}
