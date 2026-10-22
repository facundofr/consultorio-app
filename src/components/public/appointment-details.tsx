import { CalendarPlus, MapPin, Phone } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

/** Serializable view of a patient's appointment (safe to send to the browser). */
export type ClientAppointmentView = {
  code: string;
  status: string;
  when: string;
  date: string; // YYYY-MM-DD local
  time: string; // HH:mm local
  professionalName: string;
  specialtyName: string | null;
  serviceName: string;
  location: { name: string; address: string; city: string | null; notes: string | null };
  clinic: { name: string; phone: string | null; email: string | null };
  patientFirstName: string;
  cancel: { allowed: boolean; reason?: string; deadlineText: string; minHours: number };
  outOfWindowMessage: string;
  rebookHref: string;
};

export function AppointmentDetails({ view, actions }: { view: ClientAppointmentView; actions?: ReactNode }) {
  const cancelled = view.status.startsWith("cancelled");
  const [weekday, ...rest] = view.when.split(", ");
  return (
    <article className="flex flex-col gap-6" aria-labelledby="turno-titulo">
      <div className={`grid gap-4 rounded-xl border-2 bg-card p-5 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-6 ${cancelled ? "border-border opacity-80" : "border-tinta"}`}>
        <div className={`flex flex-col items-center justify-center rounded-lg px-5 py-3 ${cancelled ? "bg-muted text-muted-foreground line-through" : "bg-sol text-tinta"}`}>
          <span className="text-sm font-semibold first-letter:uppercase">{weekday}</span>
          <span className="text-3xl font-bold tabular-nums">{view.time}</span>
          <span className="text-sm font-semibold">{rest.join(", ").replace(/, \d{2}:\d{2} h$/, "")}</span>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="turno-titulo" className="text-lg font-bold">{view.professionalName}</h2>
            {cancelled ? <Badge variant="danger">Cancelado</Badge> : view.status === "confirmed" ? <Badge>Confirmado</Badge> : null}
          </div>
          <p>{view.specialtyName ? `${view.specialtyName}, ` : ""}{view.serviceName.toLowerCase()}</p>
          <p className="text-sm text-muted-foreground">{view.clinic.name}. Código <span className="font-semibold tabular-nums text-foreground">{view.code}</span></p>
        </div>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="flex gap-3">
          <MapPin className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <div>
            <dt className="font-semibold">{view.location.name}</dt>
            <dd>{view.location.address}{view.location.city && !view.location.address.includes(view.location.city) ? `, ${view.location.city}` : ""}</dd>
            {view.location.notes ? <dd className="text-sm text-muted-foreground">{view.location.notes}</dd> : null}
          </div>
        </div>
        {view.clinic.phone ? (
          <div className="flex gap-3">
            <Phone className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <div>
              <dt className="font-semibold">Teléfono de la clínica</dt>
              <dd><a className="underline underline-offset-4" href={`tel:${view.clinic.phone.replace(/[^\d+]/g, "")}`}>{view.clinic.phone}</a></dd>
            </div>
          </div>
        ) : null}
      </dl>
      {!cancelled ? (
        <p className="text-sm text-muted-foreground">Llegá 10 minutos antes con tu DNI y la credencial de tu cobertura.</p>
      ) : null}
      {actions}
    </article>
  );
}

export function CalendarLink({ href }: { href: string }) {
  return (
    <a href={href} download className="inline-flex h-12 items-center gap-2 rounded-lg border border-input bg-card px-5 font-semibold hover:bg-accent">
      <CalendarPlus className="size-5" aria-hidden /> Agregar al calendario
    </a>
  );
}
