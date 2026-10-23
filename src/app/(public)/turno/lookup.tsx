"use client";

import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { AppointmentDetails, type ClientAppointmentView } from "@/components/public/appointment-details";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cancelWithContactAction, lookupAction, type LookupState } from "./actions";
import { CancelPanel } from "./cancel-panel";

function Submit() {
  const { pending } = useFormStatus();
  return <Button type="submit" size="lg" disabled={pending}>{pending ? "Buscando…" : "Buscar mi turno"}</Button>;
}

export function Lookup({ initialCode }: { initialCode?: string }) {
  const [state, action] = useActionState<LookupState, FormData>(lookupAction, { code: initialCode });
  const [view, setView] = useState<ClientAppointmentView | null>(null);
  const uid = useId();
  const shown = view ?? state.view;

  if (shown && state.code && state.contact) {
    const { code, contact } = state;
    return (
      <AppointmentDetails
        view={shown}
        actions={<CancelPanel view={shown} cancel={() => cancelWithContactAction(code, contact)} onCancelled={setView} />}
      />
    );
  }

  return (
    <form action={action} className="flex max-w-md flex-col gap-5" noValidate>
      {state.error ? <p role="alert" className="rounded-lg bg-alerta-claro px-4 py-3 text-destructive">{state.error}</p> : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-code`} className="text-base">Código del turno</Label>
        <Input id={`${uid}-code`} name="code" defaultValue={state.code} placeholder="T-8KQ4ZP" autoCapitalize="characters" autoComplete="off" className="h-12 text-base uppercase" required aria-describedby={`${uid}-code-h`} />
        <p id={`${uid}-code-h`} className="text-sm text-muted-foreground">Lo viste al confirmar la reserva: empieza con «T-».</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${uid}-contact`} className="text-base">Teléfono o email con que reservaste</Label>
        <Input id={`${uid}-contact`} name="contact" defaultValue={state.contact} autoComplete="off" className="h-12 text-base" required />
      </div>
      <div><Submit /></div>
    </form>
  );
}
