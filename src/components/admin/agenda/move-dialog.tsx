"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { rescheduleAction, type SlotOption } from "@/app/admin/_actions/appointments";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SlotPicker } from "./slot-picker";
import type { Catalog } from "./types";

export function MoveDialog({
  open,
  onOpenChange,
  appointment,
  catalog,
  canForce,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  appointment: { id: string; professionalId: string; serviceId: string; locationId: string; date: string; label: string };
  catalog: Catalog;
  canForce: boolean;
}) {
  const router = useRouter();
  const [professionalId, setProfessionalId] = useState(appointment.professionalId);
  const [date, setDate] = useState(appointment.date);
  const [slot, setSlot] = useState<SlotOption | null>(null);
  const [force, setForce] = useState(false);
  const [forceTime, setForceTime] = useState("09:00");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const svc = catalog.services.find((s) => s.id === appointment.serviceId);
  // Only professionals who can provide the same service.
  const candidates = catalog.professionals.filter((p) => !svc?.specialtyId || p.specialtyIds.includes(svc.specialtyId));
  const prof = catalog.professionals.find((p) => p.id === professionalId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Mover turno</DialogTitle>
          <DialogDescription>{appointment.label}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="mv-prof">Profesional</Label>
            <NativeSelect id="mv-prof" value={professionalId} onChange={(e) => setProfessionalId(e.target.value)}>
              {candidates.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="mv-date">Nuevo día</Label>
            <Input id="mv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        {!force ? (
          <SlotPicker
            professionalId={professionalId}
            serviceId={appointment.serviceId}
            locationId={null}
            date={date}
            value={slot}
            onChange={setSlot}
            excludeAppointmentId={appointment.id}
            locationNames={Object.fromEntries(catalog.locations.map((l) => [l.id, l.name]))}
          />
        ) : (
          <div className="flex flex-col gap-1">
            <Label htmlFor="mv-ftime">Hora</Label>
            <Input id="mv-ftime" type="time" value={forceTime} onChange={(e) => setForceTime(e.target.value)} className="w-36" />
          </div>
        )}
        {canForce ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="size-4 accent-[var(--eucalipto)]" />
            Fuera del horario publicado
          </label>
        ) : null}
        {error ? <p role="alert" className="rounded-md bg-alerta-claro px-3 py-2 text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Volver</Button>
          <Button
            type="button"
            disabled={pending || (!force && !slot)}
            onClick={() =>
              start(async () => {
                const res = await rescheduleAction(appointment.id, force
                  ? { professionalId, locationId: prof?.locationIds.includes(appointment.locationId) ? appointment.locationId : prof?.locationIds[0], forceDate: date, forceTime }
                  : { professionalId, locationId: slot!.locationId, startsAt: slot!.startsAt });
                if (res.ok) {
                  toast.success(res.message);
                  onOpenChange(false);
                  router.refresh();
                } else setError(res.message ?? "No se pudo mover.");
              })
            }
          >
            {pending ? "Moviendo…" : "Mover turno"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
