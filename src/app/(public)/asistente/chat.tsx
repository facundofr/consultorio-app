"use client";

import { Bot, SendHorizontal } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { ChatItem, SlotOfferView } from "@/server/assistant/types";
import { pickSlotAction, sendChatAction, type ChatResponse, type ChatSession } from "./actions";
import { CardView } from "./cards";

const SUGGESTIONS = ["Quiero sacar un turno", "Quiero cancelar mi turno", "¿Dónde quedan las sedes?"];
const MAX_CHARS = 800;

export function Chat({ clinicSlug, welcome, formHref }: { clinicSlug: string; welcome: string; formHref: string }) {
  const [items, setItems] = useState<ChatItem[]>([{ id: "welcome", role: "assistant", text: welcome }]);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [items, pending]);

  const apply = useCallback((r: ChatResponse) => {
    if (r.ok) {
      setSession(r.session);
      setItems((prev) => [...prev, ...r.items]);
      setError(null);
    } else {
      setError(r.error);
      if (r.expired) setSession(null);
    }
  }, []);

  const send = (raw: string) => {
    const value = raw.trim();
    if (!value || pending) return;
    setItems((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", text: value }]);
    setText("");
    startTransition(async () => {
      apply(await sendChatAction(clinicSlug, session, value));
      inputRef.current?.focus();
    });
  };

  const pick = (o: SlotOfferView) => {
    if (!session || pending) return;
    setItems((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", text: `${o.dayLabel}, ${o.time} con ${o.professional}` }]);
    startTransition(async () => apply(await pickSlotAction(session, o.ref)));
  };

  const booked = useCallback((newItems: ChatItem[]) => setItems((prev) => [...prev, ...newItems]), []);
  // Cards shown before the last confirmed booking can no longer book (the server dropped those offers too).
  const lockBefore = items.findLastIndex((m) => m.card?.kind === "booked");

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversación con el asistente" className="flex flex-col gap-3">
        {items.map((m, i) =>
          m.role === "user" ? (
            <p key={m.id} className="max-w-[85%] self-end whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-primary-foreground">
              <span className="sr-only">Vos: </span>
              {m.text}
            </p>
          ) : (
            <div key={m.id} className="flex flex-col gap-3">
              {m.text ? (
                <p className="flex max-w-[90%] gap-2 self-start whitespace-pre-wrap rounded-2xl rounded-bl-sm border bg-card px-4 py-2.5">
                  <Bot className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                  <span>
                    <span className="sr-only">Asistente: </span>
                    {m.text}
                  </span>
                </p>
              ) : null}
              {m.card ? <CardView card={m.card} session={session} busy={pending} locked={i < lockBefore} onPick={pick} onBooked={booked} /> : null}
            </div>
          ),
        )}
        {pending ? (
          <p className="flex items-center gap-2 self-start rounded-2xl border bg-card px-4 py-2.5 text-muted-foreground">
            <Bot className="size-5 text-primary" aria-hidden /> Escribiendo…
          </p>
        ) : null}
        <div ref={endRef} />
      </div>

      {error ? (
        <div role="alert" className="rounded-lg bg-alerta-claro px-4 py-3 text-destructive">
          <p>{error}</p>
          <Link href={formHref} className="mt-1 inline-block font-semibold underline">Reservar con el formulario</Link>
        </div>
      ) : null}

      {items.length === 1 ? (
        <div className="flex flex-wrap gap-2" aria-label="Sugerencias">
          {SUGGESTIONS.map((s) => (
            <Button key={s} type="button" variant="outline" onClick={() => send(s)} disabled={pending}>
              {s}
            </Button>
          ))}
        </div>
      ) : null}

      <form
        className="sticky bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))] -mx-4 md:bottom-0 flex items-end gap-2 border-t bg-background px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <label htmlFor="chat-input" className="sr-only">Tu mensaje</label>
        <textarea
          id="chat-input"
          ref={inputRef}
          value={text}
          maxLength={MAX_CHARS}
          rows={1}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(text);
            }
          }}
          placeholder="Escribí tu consulta…"
          className="max-h-40 min-h-12 flex-1 resize-none rounded-lg border border-input bg-card px-3 py-3 text-base outline-none focus-visible:border-ring"
        />
        <Button type="submit" size="lg" disabled={pending || !text.trim()} aria-label="Enviar">
          <SendHorizontal />
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        No escribas datos personales ni de salud: para reservar te pedimos los datos en un formulario aparte. El asistente no da consejos médicos.
      </p>
    </div>
  );
}
