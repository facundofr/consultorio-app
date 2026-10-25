"use client";

import { CalendarCheck, ExternalLink, Phone, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useId, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ChatCard, ChatItem, SlotOfferView } from "@/server/assistant/types";
import { Lookup } from "../turno/lookup";
import { confirmChatBookingAction, type ChatBookState, type ChatSession } from "./actions";

const tel = (p: string) => `tel:${p.replace(/[^\d+]/g, "")}`;

function CardShell({ children, tone = "default", label }: { children: React.ReactNode; tone?: "default" | "alert" | "done"; label: string }) {
  const tones = {
    default: "border-border bg-card",
    alert: "border-destructive bg-alerta-claro",
    done: "border-tinta bg-card",
  } as const;
  return (
    <section aria-label={label} className={`flex flex-col gap-4 rounded-xl border-2 p-4 ${tones[tone]}`}>
      {children}
    </section>
  );
}

function SlotsCard({ card, onPick, disabled, locked }: { card: Extract<ChatCard, { kind: "slots" }>; onPick: (o: SlotOfferView) => void; disabled: boolean; locked: boolean }) {
  const days = new Map<string, SlotOfferView[]>();
  for (const o of card.offers) days.set(o.date, [...(days.get(o.date) ?? []), o]);
  return (
    <CardShell label={`Horarios de ${card.specialty}`}>
      <p className="text-sm text-muted-foreground">
        {card.specialty}, {card.service.toLowerCase()}.{" "}
        {locked ? "Ya reservaste un turno: si querés otro, pedile al asistente horarios nuevos." : "Tocá un horario para reservarlo."}
      </p>
      {[...days.entries()].map(([date, offers]) => (
        <div key={date} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold first-letter:uppercase">{offers[0].dayLabel}</h3>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2">
            {offers.map((o) => (
              <li key={o.ref}>
                <button
                  type="button"
                  disabled={disabled || locked}
                  onClick={() => onPick(o)}
                  aria-label={`${o.dayLabel}, ${o.time}, ${o.professional}, ${o.location}`}
                  className="group flex h-full w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-primary/30 bg-card px-2 py-2.5 text-center hover:border-solid hover:border-tinta hover:bg-sol hover:text-sol-foreground disabled:pointer-events-none disabled:opacity-60"
                >
                  <span className="text-xl font-bold tabular-nums">{o.time}</span>
                  <span className="text-xs leading-tight text-muted-foreground group-hover:text-sol-foreground/80">{o.professional}</span>
                  <span className="text-xs leading-tight text-muted-foreground group-hover:text-sol-foreground/80">{o.location}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <Link href={card.formHref} className="text-sm font-semibold text-primary underline underline-offset-4">
        Ver todos los días en el formulario
      </Link>
    </CardShell>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Confirmando…" : "Confirmar turno"}
    </Button>
  );
}

function Field({ name, label, hint, error, ...rest }: { name: "fullName" | "phone" | "email"; label: string; hint?: string; error?: string } & React.ComponentProps<"input">) {
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

function BookingCard({ card, session, locked, onBooked }: { card: Extract<ChatCard, { kind: "booking" }>; session: ChatSession; locked: boolean; onBooked: (items: ChatItem[]) => void }) {
  const [state, action] = useActionState<ChatBookState, FormData>(confirmChatBookingAction.bind(null, session, card.ref), {});
  const reported = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (state.items && reported.current !== state.seq) {
      reported.current = state.seq;
      onBooked(state.items);
    }
  }, [state, onBooked]);
  const v = state.values;

  if (state.items) {
    return (
      <CardShell label="Turno reservado">
        <p className="font-semibold">Reservado: {card.when}.</p>
      </CardShell>
    );
  }
  if (locked) {
    return (
      <CardShell label="Horario sin confirmar">
        <p className="text-muted-foreground">
          {card.when}, {card.professional}: no se reservó. Ya confirmaste otro turno en esta conversación; si querés uno más, pedile al asistente horarios nuevos.
        </p>
      </CardShell>
    );
  }
  return (
    <CardShell label="Confirmar turno">
      <div className="rounded-lg bg-sol-claro px-4 py-3">
        <p className="text-lg font-bold first-letter:uppercase">{card.when}</p>
        <p>{card.professional}. {card.specialty}, {card.service.toLowerCase()}.</p>
        <p className="text-sm text-muted-foreground">{card.location}, {card.address}</p>
      </div>
      <form key={state.seq ?? 0} action={action} className="flex flex-col gap-4" noValidate>
        <h3 className="text-lg font-bold">Tus datos</h3>
        <p className="-mt-2 text-sm text-muted-foreground">Van directo a la clínica. El asistente no los ve.</p>
        {state.error ? (
          <div role="alert" className="rounded-lg bg-alerta-claro px-4 py-3 text-destructive">
            <p>{state.error}</p>
            {state.slotGone ? <p className="mt-1 text-sm">Pedile al asistente otros horarios.</p> : null}
          </div>
        ) : null}
        <Field name="fullName" label="Nombre y apellido" autoComplete="name" defaultValue={v?.fullName} error={state.fieldErrors?.fullName} />
        <Field name="phone" label="Teléfono celular" type="tel" inputMode="tel" autoComplete="tel" defaultValue={v?.phone} hint="Con código de área, por ejemplo 11 5555-1234." error={state.fieldErrors?.phone} />
        <Field name="email" label="Email" type="email" inputMode="email" autoComplete="email" defaultValue={v?.email} hint="Te mandamos la confirmación y un recordatorio antes del turno." error={state.fieldErrors?.email} />
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
              className="mt-1 size-5 shrink-0 accent-[var(--eucalipto)]"
            />
            <span>
              Acepto que la clínica guarde mi nombre, teléfono y email para gestionar este turno, según la{" "}
              <Link href="/privacidad" target="_blank" className="font-semibold text-primary underline">política de privacidad</Link>.
            </span>
          </label>
          {state.fieldErrors?.consent ? <p className="text-sm text-destructive">{state.fieldErrors.consent}</p> : null}
        </div>
        <p className="text-sm text-muted-foreground">Podés cancelarlo online hasta {card.cancelMinHours} horas antes.</p>
        <div>
          <Submit />
        </div>
      </form>
    </CardShell>
  );
}

export function CardView({
  card,
  session,
  busy,
  locked = false,
  onPick,
  onBooked,
}: {
  card: ChatCard;
  session: ChatSession | null;
  busy: boolean;
  locked?: boolean;
  onPick: (o: SlotOfferView) => void;
  onBooked: (items: ChatItem[]) => void;
}) {
  switch (card.kind) {
    case "slots":
      return <SlotsCard card={card} onPick={onPick} disabled={busy || !session} locked={locked} />;
    case "no_slots":
      return (
        <CardShell label="Sin horarios">
          <p>No hay horarios con esos filtros. Probá con otras fechas o mirá el calendario completo.</p>
          <Link href={card.formHref} className="font-semibold text-primary underline underline-offset-4">Ver el calendario en el formulario</Link>
        </CardShell>
      );
    case "booking":
      return session ? <BookingCard card={card} session={session} locked={locked} onBooked={onBooked} /> : null;
    case "lookup":
      return (
        <CardShell label={card.action === "cancelar" ? "Cancelar un turno" : "Ver un turno"}>
          <p className="text-sm text-muted-foreground">Ingresá el código del turno y el teléfono o email con que reservaste. El asistente no ve estos datos.</p>
          <Lookup />
        </CardShell>
      );
    case "emergency":
      return (
        <CardShell label="Emergencia" tone="alert">
          <p className="flex items-start gap-2 text-lg font-bold text-destructive">
            <TriangleAlert className="mt-1 size-5 shrink-0" aria-hidden />
            {card.message}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" variant="destructive">
              <a href="tel:911"><Phone /> Llamar al 911</a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="tel:107"><Phone /> SAME 107</a>
            </Button>
          </div>
        </CardShell>
      );
    case "fallback":
      return (
        <CardShell label="Reservar con el formulario">
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href={card.formHref}>Reservar con el formulario</Link>
            </Button>
            {card.phone ? (
              <Button asChild size="lg" variant="outline">
                <a href={tel(card.phone)}><Phone /> {card.phone}</a>
              </Button>
            ) : null}
          </div>
        </CardShell>
      );
    case "booked":
      return (
        <CardShell label="Turno confirmado" tone="done">
          <p className="flex items-center gap-2 text-lg font-bold">
            <CalendarCheck className="size-6 text-primary" aria-hidden /> Turno confirmado
          </p>
          <p className="first-letter:uppercase">{card.when}. {card.professional}, {card.location}.</p>
          <p>Código <span className="font-bold tabular-nums">{card.code}</span>. Guardalo: lo vas a necesitar para verlo o cancelarlo.</p>
          {card.href ? (
            <Button asChild size="lg" className="self-start">
              <Link href={card.href}>Ver mi turno y agregarlo al calendario <ExternalLink /></Link>
            </Button>
          ) : null}
        </CardShell>
      );
  }
}
