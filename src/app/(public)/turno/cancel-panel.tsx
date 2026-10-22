"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ClientAppointmentView } from "@/components/public/appointment-details";
import type { CancelResult } from "./actions";

/** Cancellation block: explains the rule, confirms, and reports the server's answer. */
export function CancelPanel({
  view,
  cancel,
  onCancelled,
}: {
  view: ClientAppointmentView;
  cancel: () => Promise<CancelResult>;
  onCancelled?: (v: ClientAppointmentView) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<CancelResult | null>(null);
  const router = useRouter();

  if (view.status.startsWith("cancelled")) {
    return (
      <div role="status" className="flex flex-col items-start gap-3 rounded-lg bg-secondary px-4 py-3">
        <p>{result?.ok ? result.message : "Este turno está cancelado."} El horario quedó libre para otra persona.</p>
        <Link href={view.rebookHref} className="font-semibold text-primary underline underline-offset-4">
          Elegir otro día y horario con {view.professionalName}
        </Link>
      </div>
    );
  }
  if (view.status !== "confirmed") return null;

  if (!view.cancel.allowed) {
    return (
      <div role="status" className="flex flex-col gap-2 rounded-lg border border-sol bg-sol-claro px-4 py-3">
        <p className="font-semibold">Ya no se puede cancelar online.</p>
        <p>{view.outOfWindowMessage}</p>
        {view.clinic.phone ? (
          <p>
            Llamá al{" "}
            <a className="font-semibold underline" href={`tel:${view.clinic.phone.replace(/[^\d+]/g, "")}`}>
              {view.clinic.phone}
            </a>
            .
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3 border-t pt-6" aria-labelledby="cancelar-titulo">
      <h2 id="cancelar-titulo" className="font-semibold">¿No podés ir?</h2>
      <p className="text-muted-foreground">
        Podés cancelarlo online hasta el <span className="font-semibold text-foreground">{view.cancel.deadlineText}</span> ({view.cancel.minHours} horas antes).
      </p>
      {result && !result.ok ? <p role="alert" className="rounded-lg bg-alerta-claro px-4 py-3 text-destructive">{result.message}</p> : null}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="lg" className="self-start">Cancelar turno</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>¿Cancelar tu turno?</AlertDialogTitle>
          <AlertDialogDescription>
            {view.when} con {view.professionalName}. El horario queda libre para otra persona y no se puede deshacer.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>No, mantenerlo</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await cancel();
                  setResult(r);
                  setOpen(false);
                  if (r.ok && r.view) {
                    onCancelled?.(r.view);
                    router.refresh();
                  }
                })
              }
            >
              {pending ? "Cancelando…" : "Sí, cancelar"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
