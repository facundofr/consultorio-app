import type { Metadata } from "next";
import Link from "next/link";
import { ConversationBadge } from "@/components/admin/conversation-badge";
import { PageHeader, Section } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { utcToLocal } from "@/lib/time";
import { getConversation } from "@/server/admin/conversations";
import type { ChatCard } from "@/server/assistant/types";
import { adminContext } from "../../../_lib/context";
import { loadOr404 } from "../../../_lib/load";

export const metadata: Metadata = { title: "Conversación" };

const TOOL_LABELS: Record<string, string> = {
  buscar_horarios: "Buscó horarios",
  ofrecer_reserva: "Mostró el formulario de reserva",
  gestionar_turno_existente: "Mostró el formulario de turno existente",
  marcar_emergencia: "Marcó posible emergencia",
};

function cardSummary(card: ChatCard): string {
  switch (card.kind) {
    case "slots":
      return `Ofreció ${card.offers.length} horarios de ${card.specialty}: ${card.offers.map((o) => `${o.date.slice(8)}/${o.date.slice(5, 7)} ${o.time}`).join(", ")}`;
    case "no_slots":
      return "Sin horarios para esa búsqueda";
    case "booking":
      return `Formulario de confirmación: ${card.when}, ${card.professional}`;
    case "lookup":
      return card.action === "cancelar" ? "Formulario para cancelar un turno" : "Formulario para ver un turno";
    case "emergency":
      return "Mensaje de emergencia (911 / SAME 107)";
    case "fallback":
      return card.reason === "limit" ? "Pasó al formulario por límite de uso" : card.reason === "unavailable" ? "Pasó al formulario: proveedores sin respuesta" : "Asistente apagado";
    case "booked":
      return `Turno confirmado ${card.code}`;
  }
}

export default async function ConversationPage({ params }: PageProps<"/admin/conversaciones/[id]">) {
  const { db, actor } = await adminContext();
  const { id } = await params;
  const c = await loadOr404(() => getConversation(db, actor, id));
  const tz = c.timezone;
  const time = (d: Date) => utcToLocal(d, tz).time;
  const started = utcToLocal(c.conversation.createdAt, tz);
  const failures = c.usage.filter((u) => !u.ok).length;

  return (
    <>
      <PageHeader
        title={`Conversación del ${started.date.split("-").reverse().join("/")}, ${started.time}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <ConversationBadge status={c.conversation.status} />
            <span>{c.conversation.messageCount} mensajes del paciente · {c.conversation.tokenCount.toLocaleString("es-AR")} tokens</span>
            <Link href="/admin/conversaciones" className="text-primary underline underline-offset-4">Volver al listado</Link>
          </span>
        }
      />

      {c.appointment ? (
        <p className="mb-6 flex flex-wrap items-center gap-2 rounded-lg bg-secondary/60 px-4 py-3">
          Turno resultante:
          <Link href={`/admin/turnos/${c.appointment.id}`} className="font-semibold tabular-nums underline underline-offset-4">{c.appointment.code}</Link>
          <StatusBadge status={c.appointment.status} />
        </p>
      ) : null}

      <Section title="Transcripción" description="Lo que escribió el paciente (con teléfonos y emails ya borrados), lo que respondió el asistente y las herramientas que usó.">
        <ol className="flex flex-col gap-3">
          {c.transcript.map((e) => (
            <li key={e.id} className={e.kind === "user" ? "self-end max-w-[85%]" : "self-start max-w-[90%]"}>
              {e.kind === "tool" ? (
                <details className="rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-sm">
                  <summary className="cursor-pointer">
                    <span className="tabular-nums text-muted-foreground">{time(e.at)}</span>{" "}
                    <span className="font-semibold">{TOOL_LABELS[e.name] ?? e.name}</span>
                    {e.card ? <span className="text-muted-foreground"> · {cardSummary(e.card)}</span> : null}
                  </summary>
                  <p className="mt-2 font-semibold">Argumentos</p>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs">{e.args}</pre>
                  <p className="mt-2 font-semibold">Resultado</p>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs">{e.result}</pre>
                </details>
              ) : (
                <div className={`rounded-2xl px-4 py-2.5 ${e.kind === "user" ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm border bg-card"}`}>
                  <p className="mb-0.5 text-xs opacity-75">
                    {e.kind === "user" ? "Paciente" : "Asistente"} · <span className="tabular-nums">{time(e.at)}</span>
                  </p>
                  {e.text ? <p className="whitespace-pre-wrap">{e.text}</p> : null}
                  {e.card ? <p className="mt-1 text-sm italic opacity-80">[{cardSummary(e.card)}]</p> : null}
                </div>
              )}
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Llamadas al modelo" description={failures ? `${failures} fallaron y se reintentó con el siguiente proveedor.` : undefined}>
        {c.usage.length === 0 ? (
          <p className="text-muted-foreground">No se llamó al modelo (por ejemplo, urgencia detectada o límite de uso).</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hora</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Demora</TableHead>
                <TableHead>Resultado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {c.usage.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="tabular-nums">{time(u.createdAt)}</TableCell>
                  <TableCell>{u.provider}</TableCell>
                  <TableCell className="text-muted-foreground">{u.model}</TableCell>
                  <TableCell className="text-right tabular-nums">{(u.promptTokens + u.completionTokens).toLocaleString("es-AR")}</TableCell>
                  <TableCell className="text-right tabular-nums">{(u.latencyMs / 1000).toFixed(1)} s</TableCell>
                  <TableCell>{u.ok ? "OK" : <span className="text-destructive">{u.errorCode ?? "Error"}</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </>
  );
}
