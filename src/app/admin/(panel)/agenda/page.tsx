import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AgendaMiniCalendar, AgendaMonthView } from "@/components/admin/agenda/agenda-calendar";
import { AgendaGrid } from "@/components/admin/agenda/agenda-grid";
import type { Catalog } from "@/components/admin/agenda/types";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { serverNow } from "@/lib/clock";
import { addDays, utcToLocal } from "@/lib/time";
import { getAgenda, getAgendaMonth, weekStart, type AgendaMode, type AgendaView } from "@/server/admin/agenda";
import { listLocations, listServices } from "@/server/admin/catalog";
import { getPatientDetail } from "@/server/admin/patients";
import { listProfessionals } from "@/server/admin/professionals";
import { can } from "@/server/auth/rbac";
import { getClinicContext } from "@/server/clinics/settings";
import { adminContext, param } from "../../_lib/context";

export const metadata: Metadata = { title: "Agenda" };

type View = AgendaView | "month";

/** First day of the month `delta` months away from `date`. */
function shiftMonth(date: string, delta: number) {
  const [y, m] = date.split("-").map(Number);
  const t = y * 12 + (m - 1) + delta;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
}

function rangeLabel(view: View, date: string) {
  const fmt = (d: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es-AR", { ...opts, timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  if (view === "month") return fmt(date, { month: "long", year: "numeric" });
  if (view === "day") return fmt(date, { weekday: "long", day: "numeric", month: "long" });
  const s = weekStart(date);
  return `Semana del ${fmt(s, { day: "numeric", month: "long" })} al ${fmt(addDays(s, 6), { day: "numeric", month: "long" })}`;
}

export default async function AgendaPage({ searchParams }: PageProps<"/admin/agenda">) {
  const { db, actor, clinicId } = await adminContext();
  const sp = await searchParams;
  const { clinic } = await getClinicContext(db, clinicId);
  const today = utcToLocal(serverNow(), clinic.timezone).date;

  const [profs, locs, svcs] = await Promise.all([
    listProfessionals(db, actor, clinicId),
    listLocations(db, actor, clinicId),
    listServices(db, actor, clinicId),
  ]);

  const mode: AgendaMode = param(sp, "modo") === "profesional" ? "professional" : "location";
  const vista = param(sp, "vista");
  const view: View = vista === "semana" ? "week" : vista === "mes" ? "month" : "day";
  const rawDate = param(sp, "fecha");
  const date = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today;
  const options = mode === "professional" ? profs.map((p) => ({ id: p.id, name: p.displayName })) : locs.map((l) => ({ id: l.id, name: l.name }));
  const wanted = param(sp, "id");
  const subjectId = options.some((o) => o.id === wanted) ? wanted! : options[0]?.id;
  const patientId = param(sp, "paciente");
  const presetPatient = patientId ? await getPatientDetail(db, actor, patientId).then((p) => ({ id: p.id, fullName: p.fullName })).catch(() => null) : null;

  const month = date.slice(0, 7);
  const [data, monthData] = await Promise.all([
    subjectId && view !== "month" ? getAgenda(db, actor, clinicId, { view, mode, date, subjectId }) : null,
    subjectId ? getAgendaMonth(db, actor, clinicId, { mode, subjectId, month }) : null,
  ]);
  const baseQuery = new URLSearchParams({ modo: mode === "professional" ? "profesional" : "sede", ...(subjectId ? { id: subjectId } : {}), ...(patientId ? { paciente: patientId } : {}) }).toString();
  const vistaParam = view === "week" ? "semana" : view === "month" ? "mes" : "dia";
  const catalog: Catalog = {
    professionals: profs.map((p) => ({ id: p.id, name: p.displayName, specialtyIds: p.specialties.map((s) => s.id), locationIds: p.locations.map((l) => l.id) })),
    services: svcs.map(({ service: s }) => ({ id: s.id, name: s.name, durationMinutes: s.durationMinutes, specialtyId: s.specialtyId })),
    locations: locs.map((l) => ({ id: l.id, name: l.name })),
  };

  const step = view === "day" ? 1 : 7;
  const prevDate = view === "month" ? shiftMonth(date, -1) : addDays(date, -step);
  const nextDate = view === "month" ? shiftMonth(date, 1) : addDays(date, step);
  const href = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams({ modo: mode === "professional" ? "profesional" : "sede", vista: vistaParam, fecha: date, ...(subjectId ? { id: subjectId } : {}), ...(patientId ? { paciente: patientId } : {}) });
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) q.delete(k);
      else q.set(k, v);
    }
    return `/admin/agenda?${q.toString()}`;
  };

  return (
    <>
      <PageHeader title="Agenda" description={presetPatient ? `Elegí un horario libre para ${presetPatient.fullName}.` : "Tocá un horario libre para agendar. Tocá un turno para moverlo o cancelarlo."} />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        {patientId ? <input type="hidden" name="paciente" value={patientId} /> : null}
        <input type="hidden" name="fecha" value={date} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="modo">Ver por</Label>
          <NativeSelect id="modo" name="modo" defaultValue={mode === "professional" ? "profesional" : "sede"} className="w-40">
            <option value="sede">Sede</option>
            <option value="profesional">Profesional</option>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="id">{mode === "professional" ? "Profesional" : "Sede"}</Label>
          <NativeSelect id="id" name="id" defaultValue={subjectId} className="w-64">
            {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="vista">Vista</Label>
          <NativeSelect id="vista" name="vista" defaultValue={vistaParam} className="w-32">
            <option value="dia">Día</option>
            <option value="semana">Semana</option>
            <option value="mes">Mes</option>
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline">Mostrar</Button>
      </form>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="icon-sm"><Link href={href({ fecha: prevDate })} aria-label={view === "day" ? "Día anterior" : view === "week" ? "Semana anterior" : "Mes anterior"}><ChevronLeft /></Link></Button>
        <Button asChild variant="outline" size="sm"><Link href={href({ fecha: today })}>Hoy</Link></Button>
        <Button asChild variant="outline" size="icon-sm"><Link href={href({ fecha: nextDate })} aria-label={view === "day" ? "Día siguiente" : view === "week" ? "Semana siguiente" : "Mes siguiente"}><ChevronRight /></Link></Button>
        <h2 className="ml-2 text-lg font-semibold first-letter:uppercase">{rangeLabel(view, date)}</h2>
      </div>

      {view === "month" ? (
        monthData ? (
          <AgendaMonthView data={monthData} today={today} baseQuery={baseQuery} />
        ) : (
          <p className="text-muted-foreground">Cargá sedes y profesionales para ver la agenda.</p>
        )
      ) : data ? (
        data.columns.length === 0 ? (
          <p className="text-muted-foreground">Nadie atiende en esta sede todavía.</p>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[auto_minmax(0,1fr)] xl:items-start">
            {monthData ? (
              <div className="hidden xl:sticky xl:top-6 xl:block">
                <AgendaMiniCalendar key={`${baseQuery}-${month}`} initial={monthData} date={date} view={view === "week" ? "semana" : "dia"} mode={mode} subjectId={subjectId ?? null} baseQuery={baseQuery} />
              </div>
            ) : null}
            <div className="min-w-0">
          <AgendaGrid
            data={data}
            catalog={catalog}
            canWrite={can(actor, "write", "appointments")}
            canForce={can(actor, "write", "schedules")}
            presetPatient={presetPatient}
            autoOpenBooking={param(sp, "nuevo") === "1"}
            nowIso={serverNow().toISOString()}
          />
            </div>
          </div>
        )
      ) : (
        <p className="text-muted-foreground">Cargá sedes y profesionales para ver la agenda.</p>
      )}
    </>
  );
}
