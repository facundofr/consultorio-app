"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/input";
import { cancelAppointmentAdminAction } from "@/app/admin/_actions/appointments";
import type { AgendaAppointment, AgendaData } from "@/server/admin/agenda";
import { cn } from "@/lib/utils";
import { BookingDialog, type BookingPrefill } from "./booking-dialog";
import { MoveDialog } from "./move-dialog";
import type { Catalog } from "./types";

const PX_PER_MIN = 1.1;

function localParts(iso: string, tz: string) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute), time: `${p.hour}:${p.minute}` };
}

const pad = (n: number) => String(n).padStart(2, "0");
const minToTime = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

function dayTitle(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat("es-AR", { weekday: "short", day: "numeric", month: "numeric", timeZone: "UTC" }).format(d);
}

const STATUS_STYLE: Record<string, string> = {
  confirmed: "border-primary bg-card",
  completed: "border-muted-foreground/40 bg-muted text-muted-foreground",
  no_show: "border-sol bg-sol-claro",
  cancelled_by_patient: "border-destructive/40 bg-alerta-claro line-through opacity-70",
  cancelled_by_admin: "border-destructive/40 bg-alerta-claro line-through opacity-70",
};

export function AgendaGrid({
  data,
  catalog,
  canWrite,
  canForce,
  presetPatient,
  nowIso,
}: {
  data: AgendaData;
  catalog: Catalog;
  canWrite: boolean;
  canForce: boolean;
  presetPatient: { id: string; fullName: string } | null;
  nowIso: string;
}) {
  const tz = data.timezone;
  const [booking, setBooking] = useState<BookingPrefill | null>(presetPatient ? { date: data.date, professionalId: data.mode === "professional" ? data.subject?.id : undefined } : null);
  const [selected, setSelected] = useState<AgendaAppointment | null>(null);
  const [moving, setMoving] = useState<AgendaAppointment | null>(null);
  const [now, setNow] = useState(() => localParts(nowIso, tz));
  useEffect(() => {
    const t = setInterval(() => setNow(localParts(new Date().toISOString(), tz)), 60_000);
    return () => clearInterval(t);
  }, [tz]);

  const hours = useMemo(() => {
    const out: number[] = [];
    for (let m = data.startMinute; m < data.endMinute; m += 60) out.push(m);
    return out;
  }, [data.startMinute, data.endMinute]);
  const height = (data.endMinute - data.startMinute) * PX_PER_MIN;
  const top = (min: number) => (min - data.startMinute) * PX_PER_MIN;

  const openBooking = (column: AgendaData["columns"][number], minute: number, locationId?: string, professionalId?: string) => {
    if (!canWrite) return;
    const snapped = Math.floor(minute / data.stepMinutes) * data.stepMinutes;
    setBooking({
      date: column.date,
      time: minToTime(snapped),
      professionalId: professionalId ?? column.professionalId ?? (data.mode === "professional" ? data.subject?.id : undefined),
      locationId,
    });
  };

  const multiCol = data.columns.length;

  return (
    <>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <div className="grid min-w-[44rem]" style={{ gridTemplateColumns: `3.5rem repeat(${multiCol}, minmax(7.5rem, 1fr))` }}>
          {/* Header */}
          <div className="sticky left-0 z-20 border-b bg-card" />
          {data.columns.map((c) => {
            const isToday = c.date === now.date && data.mode === "professional";
            return (
              <div key={c.key} className={cn("border-b border-l px-2 py-2 text-sm font-semibold", isToday && "bg-sol-claro")}>
                {data.mode === "location" && data.view === "day" ? c.title : <span className="capitalize">{dayTitle(c.date)}</span>}
              </div>
            );
          })}
          {/* Time gutter */}
          <div className="sticky left-0 z-10 bg-card" style={{ height }}>
            {hours.map((m, i) => (
              <div key={m} className={cn("absolute pl-2 text-xs tabular-nums text-muted-foreground", i > 0 && "-translate-y-2")} style={{ top: top(m) + (i === 0 ? 2 : 1) }}>
                {minToTime(m)}
              </div>
            ))}
          </div>
          {/* Columns */}
          {data.columns.map((c) => (
            <div key={c.key} className="relative border-l" style={{ height }}>
              {hours.map((m) => (
                <div key={m} className="absolute inset-x-0 border-t border-dashed border-border/70" style={{ top: top(m) }} aria-hidden />
              ))}
              {/* Open windows: clickable to book */}
              {c.open.map((o, i) => {
                const s = localParts(o.start, tz);
                const e = localParts(o.end, tz);
                const sm = s.date === c.date ? s.minutes : 0;
                const em = e.date === c.date ? e.minutes : 24 * 60;
                const prof = catalog.professionals.find((p) => p.id === o.professionalId);
                const loc = catalog.locations.find((l) => l.id === o.locationId);
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!canWrite}
                    className="absolute inset-x-0.5 flex flex-col items-start justify-start rounded-sm bg-secondary/70 text-left hover:bg-secondary disabled:cursor-default"
                    style={{ top: top(sm), height: (em - sm) * PX_PER_MIN }}
                    aria-label={`Atiende de ${minToTime(sm)} a ${minToTime(em)}${prof && data.mode === "location" ? `, ${prof.name}` : ""}${loc ? ` en ${loc.name}` : ""}. Agendar turno`}
                    onClick={(ev) => {
                      const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                      const y = ev.clientY ? ev.clientY - rect.top : 0;
                      openBooking(c, sm + Math.max(0, y) / PX_PER_MIN, o.locationId, o.professionalId);
                    }}
                  >
                    {data.mode === "professional" && catalog.locations.length > 1 && loc ? (
                      <span className="block truncate px-1.5 pt-0.5 text-[0.7rem] text-eucalipto-oscuro/80">{loc.name}</span>
                    ) : null}
                  </button>
                );
              })}
              {/* Blocks */}
              {c.blocks.map((b, i) => {
                const s = localParts(b.start, tz);
                const e = localParts(b.end, tz);
                const sm = Math.max(data.startMinute, s.date === c.date ? s.minutes : 0);
                const em = Math.min(data.endMinute, e.date === c.date ? e.minutes : 24 * 60);
                if (em <= sm) return null;
                return (
                  <div
                    key={i}
                    className="absolute inset-x-0 overflow-hidden bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgba(23,38,46,0.07)_6px_12px)] px-1.5 pt-1 text-[0.7rem] text-muted-foreground"
                    style={{ top: top(sm), height: (em - sm) * PX_PER_MIN }}
                  >
                    {b.reason ?? "Bloqueado"}
                  </div>
                );
              })}
              {/* Appointments */}
              {c.appointments.map((a) => {
                const s = localParts(a.startsAt, tz);
                const e = localParts(a.endsAt, tz);
                const sm = s.date === c.date ? s.minutes : 0;
                const em = e.date === c.date ? e.minutes : 24 * 60;
                const h = Math.max(22, (em - sm) * PX_PER_MIN - 2);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setSelected(a)}
                    className={cn("absolute inset-x-1 z-10 overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-left text-xs shadow-xs ring-1 ring-border hover:ring-primary", STATUS_STYLE[a.status])}
                    style={{ top: top(sm) + 1, height: h }}
                    aria-label={`${s.time}, ${a.patientName}, ${a.serviceName}`}
                  >
                    <span className="font-semibold tabular-nums">{s.time}</span> <span className="font-semibold">{a.patientName}</span>
                    {h > 34 ? <span className="block truncate text-muted-foreground">{a.serviceName}{data.mode === "location" && data.view === "week" ? `, ${a.professionalName}` : ""}</span> : null}
                  </button>
                );
              })}
              {/* Now line */}
              {c.date === now.date && now.minutes >= data.startMinute && now.minutes <= data.endMinute ? (
                <div className="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-sol" style={{ top: top(now.minutes) }} aria-hidden>
                  <span className="absolute -left-1 -top-1 size-2.5 rounded-full bg-sol" />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {canWrite ? (
        <div className="mt-3">
          <Button type="button" onClick={() => setBooking({ date: data.date, professionalId: data.mode === "professional" ? data.subject?.id : undefined })}>
            Agendar turno
          </Button>
        </div>
      ) : null}

      {booking ? (
        <BookingDialog
          key={JSON.stringify(booking)}
          open={!!booking}
          onOpenChange={(o) => !o && setBooking(null)}
          catalog={catalog}
          prefill={booking}
          canForce={canForce}
          presetPatient={presetPatient}
        />
      ) : null}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        {selected ? (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{selected.patientName}</DialogTitle>
              <DialogDescription>
                {localParts(selected.startsAt, tz).time} a {localParts(selected.endsAt, tz).time}, {selected.serviceName}. {selected.professionalName}, {selected.locationName}. Código {selected.code}.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="sm:justify-between">
              <Button asChild variant="ghost"><Link href={`/admin/turnos/${selected.id}`}>Ver ficha del turno</Link></Button>
              {canWrite && selected.status === "confirmed" ? (
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <ConfirmAction
                    trigger={<Button variant="outline">Cancelar turno</Button>}
                    title="¿Cancelar este turno?"
                    description="El horario queda libre al instante y se registra en el historial."
                    confirmLabel="Cancelar turno"
                    action={async (fd) => {
                      const r = await cancelAppointmentAdminAction(fd);
                      if (r.ok) setSelected(null);
                      return r;
                    }}
                  >
                    <input type="hidden" name="id" value={selected.id} />
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="cancel-reason">Motivo (opcional)</Label>
                      <Textarea id="cancel-reason" name="reason" rows={2} className="min-h-16" />
                    </div>
                  </ConfirmAction>
                  <Button onClick={() => { setMoving(selected); setSelected(null); }}>Mover</Button>
                </div>
              ) : null}
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      {moving ? (
        <MoveDialog
          key={moving.id}
          open={!!moving}
          onOpenChange={(o) => !o && setMoving(null)}
          catalog={catalog}
          canForce={canForce}
          appointment={{
            id: moving.id,
            professionalId: moving.professionalId,
            serviceId: moving.serviceId,
            locationId: moving.locationId,
            date: localParts(moving.startsAt, tz).date,
            label: `${moving.patientName}, ${moving.serviceName}`,
          }}
        />
      ) : null}
    </>
  );
}
