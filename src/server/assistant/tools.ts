/**
 * Tools the model may call. None of them books or cancels: they look up real
 * availability or show a card that the patient confirms by hand. Arguments
 * are untrusted (the model can be wrong or manipulated) and are validated.
 */
import { z } from "zod";
import type { Db } from "@/db/client";
import { addDays, formatDateTime, formatLongDate, utcToLocal } from "@/lib/time";
import { findSlots } from "@/server/booking/public";
import { isDomainError } from "@/server/errors";
import type { ClinicKnowledge } from "./context";
import type { ToolDefinition } from "./llm";
import type { ChatCard, ConversationState, SlotOfferView, StoredOffer } from "./types";

export const MAX_OFFERS_SHOWN = 8;
const MAX_OFFERS_KEPT = 48;
const PER_DAY = 3;

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "buscar_horarios",
      description: "Busca horarios libres reales. Devuelve hasta 8, cada uno con un código H… para ofrecer_reserva.",
      parameters: {
        type: "object",
        properties: {
          especialidad: { type: "string", description: "Código de especialidad, por ejemplo E1." },
          consulta: { type: "string", description: "Código del tipo de consulta (C…). Opcional: por defecto el primero de la especialidad." },
          profesional: { type: "string", description: "Código de profesional (P…). Opcional: sin él, cualquiera de la especialidad." },
          sede: { type: "string", description: "Código de sede (L…). Opcional." },
          desde: { type: "string", description: "Fecha inicial AAAA-MM-DD. Opcional: por defecto hoy." },
          hasta: { type: "string", description: "Fecha final AAAA-MM-DD. Opcional." },
          franja: { type: "string", enum: ["manana", "tarde", "cualquiera"], description: "Mañana (antes de las 13) o tarde. Opcional." },
        },
        required: ["especialidad"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ofrecer_reserva",
      description: "Muestra el formulario para que el paciente confirme el horario elegido con sus datos. Usalo cuando el paciente elige un horario.",
      parameters: {
        type: "object",
        properties: { horario: { type: "string", description: "Código del horario devuelto por buscar_horarios, por ejemplo H3." } },
        required: ["horario"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "gestionar_turno_existente",
      description: "Muestra el formulario seguro para ver o cancelar un turno ya reservado (pide código y teléfono o email).",
      parameters: {
        type: "object",
        properties: { accion: { type: "string", enum: ["ver", "cancelar"] } },
        required: ["accion"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "marcar_emergencia",
      description: "Usalo si el paciente describe una urgencia o un riesgo para la vida. Muestra los teléfonos de emergencia.",
      parameters: { type: "object", properties: {} },
    },
  },
];

export type ToolContext = {
  db: Db;
  clinicId: string;
  clinicSlug: string;
  knowledge: ClinicKnowledge;
  state: ConversationState;
  now: Date;
};

export type ToolOutcome = {
  /** What the model reads back (JSON). */
  result: Record<string, unknown>;
  card?: ChatCard;
  markUrgent?: boolean;
};

const ref = (prefix: string) => z.string().trim().toUpperCase().regex(new RegExp(`^${prefix}\\d{1,3}$`));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const SearchArgs = z.object({
  especialidad: ref("E"),
  consulta: ref("C").optional().catch(undefined),
  profesional: ref("P").optional().catch(undefined),
  sede: ref("L").optional().catch(undefined),
  desde: date.optional().catch(undefined),
  hasta: date.optional().catch(undefined),
  franja: z.enum(["manana", "tarde", "cualquiera"]).optional().catch(undefined),
});

export function formHrefFor(clinicSlug: string, specialtyId?: string) {
  return `/reservar?clinica=${encodeURIComponent(clinicSlug)}${specialtyId ? `&especialidad=${specialtyId}` : ""}`;
}

/** Pick a varied set: at most PER_DAY per day, in time order. */
function pickVaried<T extends { localDate: string }>(slots: T[], max: number): T[] {
  const perDay = new Map<string, number>();
  const out: T[] = [];
  for (const s of slots) {
    const n = perDay.get(s.localDate) ?? 0;
    if (n >= PER_DAY) continue;
    perDay.set(s.localDate, n + 1);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

export function offerView(o: StoredOffer, k: ClinicKnowledge): SlotOfferView {
  const tz = k.info.timezone;
  const at = new Date(o.startsAt);
  const l = utcToLocal(at, tz);
  const spec = k.specialties.find((s) => s.id === o.specialtyId);
  return {
    ref: o.ref,
    date: l.date,
    time: l.time,
    dayLabel: formatLongDate(at, tz),
    professional: spec?.professionals.find((p) => p.id === o.professionalId)?.name ?? "",
    location: k.locations.find((x) => x.id === o.locationId)?.name ?? "",
  };
}

async function searchSlots(raw: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const parsed = SearchArgs.safeParse(raw);
  if (!parsed.success) return { result: { error: "Falta la especialidad o el código no es válido. Usá un código E… de la lista." } };
  const a = parsed.data;
  const k = ctx.knowledge;
  const spec = k.specialties.find((s) => s.ref === a.especialidad);
  if (!spec) return { result: { error: `No existe la especialidad ${a.especialidad}. Usá un código de la lista.` } };
  const service = (a.consulta && spec.services.find((s) => s.ref === a.consulta)) || spec.services[0];
  if (!service) return { result: { error: "Esa especialidad no tiene tipos de consulta online." } };
  const prof = a.profesional ? spec.professionals.find((p) => p.ref === a.profesional) : undefined;
  if (a.profesional && !prof) return { result: { error: `${a.profesional} no atiende ${spec.name}. Elegí un profesional de esa especialidad.` } };
  const loc = a.sede ? k.locations.find((l) => l.ref === a.sede) : undefined;

  const today = utcToLocal(ctx.now, k.info.timezone).date;
  const from = a.desde && a.desde > today ? a.desde : today;
  const to = a.hasta && a.hasta >= from ? a.hasta : addDays(from, 20);

  let slots;
  try {
    ({ slots } = await findSlots(
      ctx.db,
      { clinicId: ctx.clinicId, specialtyId: spec.id, serviceId: service.id, professionalId: prof?.id ?? null, locationId: loc?.id ?? null, fromDate: from, toDate: to },
      ctx.now,
    ));
  } catch (e) {
    if (isDomainError(e)) return { result: { error: e.userMessage } };
    throw e;
  }
  if (a.franja === "manana") slots = slots.filter((s) => s.localTime < "13:00");
  if (a.franja === "tarde") slots = slots.filter((s) => s.localTime >= "13:00");

  const formHref = formHrefFor(ctx.clinicSlug, spec.id);
  if (!slots.length) {
    return {
      result: { horarios: [], nota: `No hay horarios libres de ${spec.name} entre ${from} y ${to} con esos filtros. Ofrecé buscar otras fechas, otro profesional u otra franja.` },
      card: { kind: "no_slots", formHref },
    };
  }

  const picked = pickVaried(slots, MAX_OFFERS_SHOWN);
  let next = ctx.state.nextOffer ?? 1;
  const offers: StoredOffer[] = picked.map((s) => ({
    ref: `H${next++}`,
    professionalId: s.professionalId,
    locationId: s.locationId,
    serviceId: service.id,
    specialtyId: spec.id,
    startsAt: s.startsAt,
  }));
  ctx.state.nextOffer = next;
  ctx.state.offers = [...(ctx.state.offers ?? []), ...offers].slice(-MAX_OFFERS_KEPT);

  const views = offers.map((o) => offerView(o, k));
  return {
    result: {
      especialidad: spec.name,
      consulta: service.name,
      horarios: views.map((v) => ({ codigo: v.ref, dia: `${v.dayLabel} (${v.date})`, hora: v.time, profesional: v.professional, sede: v.location })),
      hay_mas: slots.length > picked.length,
      nota: "Los horarios ya se ven como botones. Resumilos en una oración y preguntá cuál prefiere.",
    },
    card: { kind: "slots", specialty: spec.name, service: service.name, offers: views, formHref },
  };
}

export function findOffer(state: ConversationState, offerRef: string): StoredOffer | undefined {
  const r = offerRef.trim().toUpperCase();
  return state.offers?.find((o) => o.ref === r);
}

export function bookingCard(o: StoredOffer, k: ClinicKnowledge): ChatCard {
  const spec = k.specialties.find((s) => s.id === o.specialtyId);
  const loc = k.locations.find((l) => l.id === o.locationId);
  return {
    kind: "booking",
    ref: o.ref,
    when: formatDateTime(new Date(o.startsAt), k.info.timezone),
    professional: spec?.professionals.find((p) => p.id === o.professionalId)?.name ?? "",
    specialty: spec?.name ?? "",
    service: spec?.services.find((s) => s.id === o.serviceId)?.name ?? "",
    location: loc?.name ?? "",
    address: loc?.address ?? "",
    cancelMinHours: k.info.cancelMinHours,
  };
}

function offerBooking(raw: unknown, ctx: ToolContext): ToolOutcome {
  const parsed = z.object({ horario: ref("H") }).safeParse(raw);
  const offer = parsed.success ? findOffer(ctx.state, parsed.data.horario) : undefined;
  if (!offer) return { result: { error: "Ese código de horario no existe. Usá uno devuelto por buscar_horarios, o buscá de nuevo." } };
  return {
    result: { ok: true, nota: "Se muestra el formulario de confirmación. Decile que complete sus datos ahí; no los pidas por chat." },
    card: bookingCard(offer, ctx.knowledge),
  };
}

export async function runTool(name: string, rawArgs: string, ctx: ToolContext): Promise<ToolOutcome> {
  let args: unknown = {};
  try {
    args = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    return { result: { error: "Argumentos inválidos (no es JSON)." } };
  }
  switch (name) {
    case "buscar_horarios":
      return searchSlots(args, ctx);
    case "ofrecer_reserva":
      return offerBooking(args, ctx);
    case "gestionar_turno_existente": {
      const action = z.object({ accion: z.enum(["ver", "cancelar"]) }).safeParse(args);
      const a = action.success ? action.data.accion : "ver";
      return {
        result: { ok: true, nota: "Se muestra el formulario seguro. Decile que ingrese ahí el código del turno y su teléfono o email." },
        card: { kind: "lookup", action: a },
      };
    }
    case "marcar_emergencia":
      return {
        result: { ok: true, nota: "Se mostró el mensaje de emergencia. No sigas con el turno salvo que el paciente lo pida." },
        card: { kind: "emergency", message: ctx.knowledge.info.emergencyMessage },
        markUrgent: true,
      };
    default:
      return { result: { error: `La herramienta ${name} no existe.` } };
  }
}
