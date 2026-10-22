"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bookAction, type BookState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Confirmando…" : "Confirmar turno"}
    </Button>
  );
}

function Field({
  name,
  label,
  hint,
  error,
  ...rest
}: { name: "fullName" | "phone" | "email"; label: string; hint?: string; error?: string } & React.ComponentProps<"input">) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-base">{label}</Label>
      <Input
        id={id}
        name={name}
        required
        aria-invalid={!!error || undefined}
        aria-describedby={error ? `${id}-e` : hint ? `${id}-h` : undefined}
        className="h-12 text-base"
        {...rest}
      />
      {error ? <p id={`${id}-e`} className="text-sm text-destructive">{error}</p> : hint ? <p id={`${id}-h`} className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function BookingForm({
  slot,
  backToTimes,
  cancelMinHours,
}: {
  slot: { professionalId: string; locationId: string; serviceId: string; startsAt: string };
  backToTimes: string;
  cancelMinHours: number;
}) {
  const [state, action] = useActionState<BookState, FormData>(bookAction.bind(null, slot), {});
  const v = state.values;
  return (
    <form key={state.seq ?? 0} action={action} className="flex max-w-xl flex-col gap-5" noValidate>
      <h2 className="text-xl font-bold">Tus datos</h2>
      {state.error ? (
        <div role="alert" className="rounded-lg bg-alerta-claro px-4 py-3 text-destructive">
          <p>{state.error}</p>
          {state.slotGone ? (
            <Link href={backToTimes} className="mt-1 inline-block font-semibold underline">Ver otros horarios</Link>
          ) : null}
        </div>
      ) : null}
      <Field name="fullName" label="Nombre y apellido" autoComplete="name" defaultValue={v?.fullName} error={state.fieldErrors?.fullName} />
      <Field name="phone" label="Teléfono celular" type="tel" inputMode="tel" autoComplete="tel" defaultValue={v?.phone} hint="Con código de área, por ejemplo 11 5555-1234." error={state.fieldErrors?.phone} />
      <Field name="email" label="Email" type="email" inputMode="email" autoComplete="email" defaultValue={v?.email} hint="Te mandamos la confirmación y un recordatorio." error={state.fieldErrors?.email} />
      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden>
        <label>
          No completar
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className="flex flex-col gap-1">
        <label className="flex items-start gap-3 rounded-lg border bg-card p-3 has-[:checked]:border-primary">
          <input
            type="checkbox"
            name="consent"
            defaultChecked={v?.consent}
            aria-invalid={!!state.fieldErrors?.consent || undefined}
            aria-describedby={state.fieldErrors?.consent ? "consent-e" : undefined}
            className="mt-1 size-5 shrink-0 accent-[var(--eucalipto)]"
          />
          <span>
            Acepto que la clínica guarde mi nombre, teléfono y email para gestionar este turno, según la{" "}
            <Link href="/privacidad" target="_blank" className="font-semibold text-primary underline">política de privacidad</Link>.
          </span>
        </label>
        {state.fieldErrors?.consent ? <p id="consent-e" className="text-sm text-destructive">{state.fieldErrors.consent}</p> : null}
      </div>
      <p className="text-sm text-muted-foreground">Podés cancelarlo online hasta {cancelMinHours} horas antes.</p>
      <div>
        <Submit />
      </div>
    </form>
  );
}
