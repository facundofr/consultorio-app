"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cancelAppointmentAdminAction, setStatusAction } from "@/app/admin/_actions/appointments";
import { MoveDialog } from "@/components/admin/agenda/move-dialog";
import type { Catalog } from "@/components/admin/agenda/types";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AppointmentActions({
  appointment,
  catalog,
  canForce,
}: {
  appointment: { id: string; status: string; professionalId: string; serviceId: string; locationId: string; date: string; label: string; isPast: boolean };
  catalog: Catalog;
  canForce: boolean;
}) {
  const [moving, setMoving] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const status = (s: "confirmed" | "completed" | "no_show") =>
    start(async () => {
      const r = await setStatusAction(appointment.id, s);
      if (r.ok) {
        toast.success(r.message);
        router.refresh();
      } else toast.error(r.message);
    });

  if (appointment.status.startsWith("cancelled")) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {appointment.status === "confirmed" ? (
        <>
          <Button onClick={() => setMoving(true)}>Mover</Button>
          <ConfirmAction
            trigger={<Button variant="outline">Cancelar turno</Button>}
            title="¿Cancelar este turno?"
            description="El horario queda libre al instante. Al paciente le llega un email de aviso."
            confirmLabel="Cancelar turno"
            action={cancelAppointmentAdminAction}
          >
            <input type="hidden" name="id" value={appointment.id} />
            <div className="flex flex-col gap-1">
              <Label htmlFor="reason">Motivo (opcional)</Label>
              <Textarea id="reason" name="reason" rows={2} className="min-h-16" />
            </div>
          </ConfirmAction>
        </>
      ) : null}
      {appointment.isPast && appointment.status !== "completed" ? <Button variant="outline" disabled={pending} onClick={() => status("completed")}>Marcar atendido</Button> : null}
      {appointment.isPast && appointment.status !== "no_show" ? <Button variant="outline" disabled={pending} onClick={() => status("no_show")}>Marcar ausente</Button> : null}
      {appointment.status !== "confirmed" ? <Button variant="ghost" disabled={pending} onClick={() => status("confirmed")}>Volver a confirmado</Button> : null}
      {moving ? <MoveDialog open={moving} onOpenChange={setMoving} appointment={appointment} catalog={catalog} canForce={canForce} /> : null}
    </div>
  );
}
