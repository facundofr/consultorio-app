"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { createAppointmentAdminAction, findPatientsAction, type SlotOption } from "@/app/admin/_actions/appointments";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SlotPicker } from "./slot-picker";
import { servicesFor, type Catalog } from "./types";

export type BookingPrefill = { professionalId?: string; locationId?: string; date: string; time?: string };

type PatientChoice = { kind: "existing"; id: string; label: string } | { kind: "new" };

export function BookingDialog({
  open,
  onOpenChange,
  catalog,
  prefill,
  canForce,
  presetPatient,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  catalog: Catalog;
  prefill: BookingPrefill;
  canForce: boolean;
  presetPatient?: { id: string; fullName: string } | null;
}) {
  const router = useRouter();
  const [professionalId, setProfessionalId] = useState(prefill.professionalId ?? catalog.professionals[0]?.id ?? "");
  const svcList = useMemo(() => servicesFor(catalog, professionalId), [catalog, professionalId]);
  const [chosenServiceId, setServiceId] = useState(svcList[0]?.id ?? "");
  const serviceId = svcList.some((s) => s.id === chosenServiceId) ? chosenServiceId : (svcList[0]?.id ?? "");
  const prof = catalog.professionals.find((p) => p.id === professionalId);
  const locs = catalog.locations.filter((l) => prof?.locationIds.includes(l.id));
  const [locationId, setLocationId] = useState<string>(prefill.locationId ?? "");
  const [date, setDate] = useState(prefill.date);
  const [slot, setSlot] = useState<SlotOption | null>(null);
  const [force, setForce] = useState(false);
  const [forceTime, setForceTime] = useState(prefill.time ?? "09:00");
  const [patient, setPatient] = useState<PatientChoice | null>(presetPatient ? { kind: "existing", id: presetPatient.id, label: presetPatient.fullName } : null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; fullName: string; phoneLast4: string }[]>([]);
  const [np, setNp] = useState({ fullName: "", phone: "", email: "" });
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const t = setTimeout(async () => setResults(q.trim().length >= 2 ? await findPatientsAction(q) : []), 250);
    return () => clearTimeout(t);
  }, [q]);

  const locationNames = Object.fromEntries(catalog.locations.map((l) => [l.id, l.name]));
  const canSubmit =
    !!patient &&
    (patient.kind === "existing" || (np.fullName.trim().length >= 3 && np.phone.trim().length >= 8)) &&
    !!serviceId &&
    (force ? !!forceTime && !!(locationId || locs[0]) : !!slot);

  const submit = () =>
    start(async () => {
      setError(null);
      const res = await createAppointmentAdminAction({
        professionalId,
        serviceId,
        locationId: force ? locationId || locs[0]!.id : slot!.locationId,
        startsAt: force ? undefined : slot!.startsAt,
        forceDate: force ? date : undefined,
        forceTime: force ? forceTime : undefined,
        patientId: patient?.kind === "existing" ? patient.id : undefined,
        patient: patient?.kind === "new" ? np : undefined,
        notes: notes || undefined,
      });
      if (res.ok) {
        toast.success(res.message);
        onOpenChange(false);
        setPatient(presetPatient ? { kind: "existing", id: presetPatient.id, label: presetPatient.fullName } : null);
        setNp({ fullName: "", phone: "", email: "" });
        setNotes("");
        router.refresh();
      } else setError(res.message ?? "No se pudo agendar.");
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Agendar turno</DialogTitle>
          <DialogDescription>Elegí paciente, consulta y uno de los horarios libres.</DialogDescription>
        </DialogHeader>

        <section className="flex flex-col gap-3" aria-labelledby="bk-patient">
          <h3 id="bk-patient" className="text-sm font-semibold">Paciente</h3>
          {patient?.kind === "existing" ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border bg-secondary px-3 py-2">
              <span className="font-semibold">{patient.label}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPatient(null)}>Cambiar</Button>
            </div>
          ) : patient?.kind === "new" ? (
            <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1 sm:col-span-3">
                <Label htmlFor="np-name">Nombre y apellido</Label>
                <Input id="np-name" value={np.fullName} onChange={(e) => setNp({ ...np, fullName: e.target.value })} autoComplete="off" />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="np-phone">Teléfono</Label>
                <Input id="np-phone" type="tel" value={np.phone} onChange={(e) => setNp({ ...np, phone: e.target.value })} autoComplete="off" />
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <Label htmlFor="np-email">Email (opcional)</Label>
                <Input id="np-email" type="email" value={np.email} onChange={(e) => setNp({ ...np, email: e.target.value })} autoComplete="off" />
              </div>
              <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => setPatient(null)}>Buscar uno existente</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="bk-search">Buscar por nombre, teléfono completo o email</Label>
              <Input id="bk-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="María Pérez" autoComplete="off" />
              {results.length ? (
                <ul className="divide-y rounded-lg border" aria-label="Resultados">
                  {results.map((r) => (
                    <li key={r.id}>
                      <button type="button" className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted" onClick={() => setPatient({ kind: "existing", id: r.id, label: r.fullName })}>
                        <span className="font-semibold">{r.fullName}</span>
                        <span className="text-sm tabular-nums text-muted-foreground">tel. …{r.phoneLast4}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : q.trim().length >= 2 ? (
                <p className="text-sm text-muted-foreground">Sin resultados.</p>
              ) : null}
              <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => { setPatient({ kind: "new" }); setNp((v) => ({ ...v, fullName: q })); }}>
                Paciente nuevo
              </Button>
            </div>
          )}
        </section>

        <section className="grid gap-3 sm:grid-cols-2" aria-label="Consulta">
          <div className="flex flex-col gap-1">
            <Label htmlFor="bk-prof">Profesional</Label>
            <NativeSelect id="bk-prof" value={professionalId} onChange={(e) => { setProfessionalId(e.target.value); setLocationId(""); }}>
              {catalog.professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="bk-svc">Tipo de consulta</Label>
            <NativeSelect id="bk-svc" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              {svcList.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.durationMinutes} min)</option>)}
            </NativeSelect>
          </div>
          {locs.length > 1 ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor="bk-loc">Sede</Label>
              <NativeSelect id="bk-loc" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">{force ? "Elegí…" : "Cualquiera"}</option>
                {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </NativeSelect>
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <Label htmlFor="bk-date">Día</Label>
            <Input id="bk-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </section>

        <section className="flex flex-col gap-2" aria-label="Horario">
          {!force ? (
            <SlotPicker
              professionalId={professionalId}
              serviceId={serviceId}
              locationId={locationId || null}
              date={date}
              value={slot}
              onChange={setSlot}
              preferredTime={prefill.time}
              locationNames={locationNames}
            />
          ) : (
            <div className="flex items-end gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="bk-ftime">Hora</Label>
                <Input id="bk-ftime" type="time" value={forceTime} onChange={(e) => setForceTime(e.target.value)} />
              </div>
              <p className="pb-2 text-sm text-muted-foreground">Fuera de la grilla. Igual no puede superponerse con otro turno.</p>
            </div>
          )}
          {canForce ? (
            <label className="mt-1 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="size-4 accent-[var(--eucalipto)]" />
              Agendar fuera del horario publicado (sobreturno)
            </label>
          ) : null}
        </section>

        <div className="flex flex-col gap-1">
          <Label htmlFor="bk-notes">Nota interna (opcional)</Label>
          <Textarea id="bk-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="min-h-16" placeholder="Solo la ve el equipo. No escribas datos clínicos." />
        </div>

        {error ? <p role="alert" className="rounded-md bg-alerta-claro px-3 py-2 text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" onClick={submit} disabled={!canSubmit || pending}>{pending ? "Agendando…" : "Agendar turno"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
