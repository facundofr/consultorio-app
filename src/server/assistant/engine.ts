/**
 * Conversation engine for the booking assistant.
 *
 * Order of checks for every patient message:
 *   conversation + secret → limits (daily, per conversation) → redaction of
 *   personal data → emergency check (no model) → model with tools.
 * The model never books or cancels: the patient confirms in a card, and that
 * goes through the same `bookPublic` as the form.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gte, lt, max, sql } from "drizzle-orm";
import { ZodError } from "zod";
import type { Db } from "@/db/client";
import { conversations, llmUsage, messages } from "@/db/schema";
import { localDayBounds, utcToLocal } from "@/lib/time";
import { bookPublic, getClinicPublic, type PublicBookingInput } from "@/server/booking/public";
import { DomainError, isDomainError } from "@/server/errors";
import { assistantConfig, type AssistantConfig } from "./config";
import { buildSystemPrompt, loadClinicKnowledge, type ClinicKnowledge } from "./context";
import { createLlmClient, LlmUnavailableError, type Attempt, type ChatMessage, type LlmClient, type ToolCall } from "./llm";
import { redactPersonalData } from "./redact";
import { looksLikeEmergency } from "./safety";
import { bookingCard, findOffer, formHrefFor, runTool, TOOL_DEFINITIONS, type ToolContext } from "./tools";
import type { ChatCard, ChatItem, ConversationState } from "./types";


export const MAX_MESSAGE_CHARS = 800;
const HISTORY_MESSAGES = 30;

export type EngineDeps = { llm?: LlmClient; config?: AssistantConfig; now?: Date };

type ConversationRow = typeof conversations.$inferSelect;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function secretMatches(secret: string, state: ConversationState) {
  if (!state.secretHash || typeof secret !== "string" || !secret) return false;
  const a = Buffer.from(sha256(secret), "hex");
  const b = Buffer.from(state.secretHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Monotonic timestamps so messages written in one turn keep their order. */
function clockFrom(now: Date) {
  let last = now.getTime();
  return () => new Date(++last);
}

function resolveDeps(deps: EngineDeps) {
  const config = deps.config ?? assistantConfig();
  const llm = deps.llm ?? createLlmClient(config.providers, { timeoutMs: config.timeoutMs });
  return { config, llm, now: deps.now ?? new Date() };
}

/* ------------------------------ Housekeeping ------------------------------ */

let lastSweep = 0;

/** Delete conversations past the retention period and mark idle ones as abandoned. */
export async function sweepConversations(db: Db, retentionDays: number, now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
  const deleted = await db.delete(conversations).where(lt(conversations.lastMessageAt, cutoff)).returning({ id: conversations.id });
  await db
    .update(conversations)
    .set({ status: "abandoned" })
    .where(and(eq(conversations.status, "active"), lt(conversations.lastMessageAt, new Date(now.getTime() - 86_400_000))));
  return { deleted: deleted.length };
}

async function maybeSweep(db: Db, cfg: AssistantConfig, now: Date) {
  if (now.getTime() - lastSweep < 3_600_000) return;
  lastSweep = now.getTime();
  try {
    await sweepConversations(db, cfg.retentionDays, now);
  } catch (e) {
    console.error("[assistant] sweep failed:", e instanceof Error ? e.message : "unknown");
  }
}

/** Tokens used today (local day of the app), all conversations together. */
export async function tokensUsedToday(db: Db, now: Date, tz: string) {
  const { start } = localDayBounds(utcToLocal(now, tz).date, tz);
  const [r] = await db
    .select({ n: sql<number>`coalesce(sum(${llmUsage.promptTokens} + ${llmUsage.completionTokens}), 0)::int` })
    .from(llmUsage)
    .where(gte(llmUsage.createdAt, start));
  return r?.n ?? 0;
}

/* ------------------------------- Lifecycle -------------------------------- */

async function loadConversation(db: Db, conversationId: string, secret: string) {
  const ok = /^[0-9a-f-]{36}$/i.test(conversationId);
  const [row] = ok ? await db.select().from(conversations).where(eq(conversations.id, conversationId)) : [];
  const state = (row?.state ?? {}) as ConversationState;
  if (!row || !row.clinicId || !secretMatches(secret, state)) {
    throw new DomainError("NOT_FOUND", "La conversación terminó. Empezá una nueva.");
  }
  return { row, state, clinicId: row.clinicId };
}

export async function startConversation(db: Db, clinicIdOrSlug: string, ipHash: string | null, deps: EngineDeps = {}) {
  const { config, now } = resolveDeps(deps);
  const clinic = await getClinicPublic(db, clinicIdOrSlug);
  await maybeSweep(db, config, now);
  const k = await loadClinicKnowledge(db, clinic.id);
  const secret = randomBytes(24).toString("base64url");
  const [conv] = await db
    .insert(conversations)
    .values({ clinicId: clinic.id, ipHash, state: { secretHash: sha256(secret) } satisfies ConversationState, createdAt: now, lastMessageAt: now })
    .returning();
  const [welcome] = await db
    .insert(messages)
    .values({ conversationId: conv.id, role: "assistant", content: k.info.welcomeText, createdAt: now })
    .returning();
  const items: ChatItem[] = [{ id: welcome.id, role: "assistant", text: k.info.welcomeText }];
  if (!config.enabled) items.push({ id: `${welcome.id}-off`, role: "assistant", card: fallbackCard("disabled", clinic.slug, k) });
  return { conversationId: conv.id, secret, items, enabled: config.enabled };
}

function fallbackCard(reason: "limit" | "unavailable" | "disabled", clinicSlug: string, k: ClinicKnowledge): ChatCard {
  return { kind: "fallback", reason, formHref: formHrefFor(clinicSlug), phone: k.info.phone };
}

const FALLBACK_TEXT: Record<"limit" | "unavailable" | "disabled", string> = {
  limit: "Por hoy el asistente llegó a su límite de uso. Podés reservar igual con el formulario, es rápido.",
  unavailable: "Ahora no puedo responder. Podés reservar con el formulario o llamar a la clínica.",
  disabled: "El asistente no está disponible. Podés reservar con el formulario.",
};

/* ------------------------------ Messages --------------------------------- */

async function writerFor(db: Db, conversationId: string, now: Date) {
  const [last] = await db.select({ at: max(messages.createdAt) }).from(messages).where(eq(messages.conversationId, conversationId));
  const tick = clockFrom(last?.at && last.at > now ? last.at : now);
  return {
    async user(content: string) {
      const [m] = await db.insert(messages).values({ conversationId, role: "user", content, createdAt: tick() }).returning({ id: messages.id });
      return m.id;
    },
    async assistant(content: string, payload?: Record<string, unknown>) {
      const [m] = await db
        .insert(messages)
        .values({ conversationId, role: "assistant", content, payload: payload ?? null, createdAt: tick() })
        .returning({ id: messages.id });
      return m.id;
    },
    async tool(call: ToolCall, result: unknown, card?: ChatCard) {
      const [m] = await db
        .insert(messages)
        .values({
          conversationId,
          role: "tool",
          toolName: call.function.name,
          toolCallId: call.id,
          content: JSON.stringify(result),
          payload: { arguments: call.function.arguments, ...(card ? { card: storableCard(card) } : {}) },
          createdAt: tick(),
        })
        .returning({ id: messages.id });
      return m.id;
    },
  };
}

/** Never persist the cancel-token link. */
function storableCard(card: ChatCard): ChatCard {
  if (card.kind === "booked") {
    const { href: _href, ...rest } = card;
    void _href;
    return rest;
  }
  return card;
}

/** Rebuild the model's view of the conversation from the database. */
async function history(db: Db, conversationId: string): Promise<ChatMessage[]> {
  const rows = (
    await db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(desc(messages.createdAt)).limit(HISTORY_MESSAGES)
  ).reverse();
  while (rows.length && rows[0].role === "tool") rows.shift();
  const out: ChatMessage[] = [];
  for (const r of rows) {
    if (r.role === "user") out.push({ role: "user", content: r.content });
    else if (r.role === "tool") out.push({ role: "tool", tool_call_id: r.toolCallId ?? "", content: r.content });
    else if (r.role === "assistant") {
      const calls = (r.payload as { tool_calls?: ToolCall[] } | null)?.tool_calls;
      out.push(calls?.length ? { role: "assistant", content: r.content || null, tool_calls: calls } : { role: "assistant", content: r.content });
    }
  }
  return out;
}

async function recordAttempt(db: Db, conversationId: string, a: Attempt, at: Date) {
  await db.insert(llmUsage).values({
    conversationId,
    provider: a.provider,
    model: a.model,
    promptTokens: a.promptTokens,
    completionTokens: a.completionTokens,
    latencyMs: a.latencyMs,
    ok: a.ok,
    errorCode: a.errorCode ?? null,
    createdAt: at,
  });
}

async function saveConversation(db: Db, row: ConversationRow, patch: Partial<ConversationRow>, now: Date) {
  await db
    .update(conversations)
    .set({ ...patch, lastMessageAt: now })
    .where(eq(conversations.id, row.id));
}

export type TurnResult = { items: ChatItem[]; status: ConversationRow["status"] };

/** Handle one patient message. */
export async function sendMessage(
  db: Db,
  input: { conversationId: string; secret: string; text: string },
  deps: EngineDeps = {},
): Promise<TurnResult> {
  const { config, llm, now } = resolveDeps(deps);
  const { row, state, clinicId } = await loadConversation(db, input.conversationId, input.secret);
  const raw = input.text.replace(/\s+/g, " ").trim().slice(0, MAX_MESSAGE_CHARS);
  if (!raw) throw new DomainError("VALIDATION", "Escribí tu consulta.");

  const clinic = await getClinicPublic(db, clinicId);
  const k = await loadClinicKnowledge(db, clinicId);
  const w = await writerFor(db, row.id, now);
  const { text } = redactPersonalData(raw);
  await w.user(text);
  const userCount = row.messageCount + 1;
  const items: ChatItem[] = [];

  const finish = async (status: ConversationRow["status"], extra: Partial<ConversationRow> = {}) => {
    await saveConversation(db, row, { status, messageCount: userCount, state, ...extra }, now);
    return { items, status };
  };

  // 1. Emergencies: answer right away, without the model.
  if (looksLikeEmergency(raw)) {
    const card: ChatCard = { kind: "emergency", message: k.info.emergencyMessage };
    const id = await w.assistant(k.info.emergencyMessage, { card });
    items.push({ id, role: "assistant", card });
    return finish("urgent");
  }

  // 2. Off, or over a limit: offer the form.
  const overConversation = row.tokenCount >= config.conversationTokenLimit || userCount > config.conversationMessageLimit;
  const overDaily = config.dailyTokenLimit > 0 && (await tokensUsedToday(db, now, k.info.timezone)) >= config.dailyTokenLimit;
  if (!config.enabled || overConversation || overDaily) {
    const reason = !config.enabled ? "disabled" : "limit";
    const card = fallbackCard(reason, clinic.slug, k);
    const id = await w.assistant(FALLBACK_TEXT[reason], { card });
    items.push({ id, role: "assistant", text: FALLBACK_TEXT[reason], card });
    return finish(reason === "limit" ? "limited" : row.status);
  }

  // 3. The model, with tools.
  const ctx: ToolContext = { db, clinicId, clinicSlug: clinic.slug, knowledge: k, state, now };
  const convo: ChatMessage[] = [{ role: "system", content: buildSystemPrompt(k, now) }, ...(await history(db, row.id))];
  let tokens = 0;
  let urgent = false;
  const cards: ChatItem[] = [];
  let finalText: string | null = null;
  try {
    for (let round = 0; round < config.maxToolRounds; round++) {
      const res = await llm({ messages: convo, tools: TOOL_DEFINITIONS }, async (a) => {
        tokens += a.promptTokens + a.completionTokens;
        await recordAttempt(db, row.id, a, now);
      });
      const calls = res.message.tool_calls ?? [];
      if (!calls.length) {
        finalText = res.message.content?.trim() || null;
        break;
      }
      await w.assistant(res.message.content ?? "", { tool_calls: calls });
      convo.push({ role: "assistant", content: res.message.content ?? null, tool_calls: calls });
      for (const call of calls.slice(0, 4)) {
        const out = await runTool(call.function.name, call.function.arguments, ctx);
        const id = await w.tool(call, out.result, out.card);
        convo.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(out.result) });
        if (out.card) cards.push({ id, role: "assistant", card: out.card });
        if (out.markUrgent) urgent = true;
      }
      // Tool calls the model asked for beyond the first four are answered with an error.
      for (const call of calls.slice(4)) {
        const result = { error: "Demasiadas herramientas a la vez." };
        await w.tool(call, result);
        convo.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
  } catch (e) {
    if (!(e instanceof LlmUnavailableError)) throw e;
    console.error("[assistant] providers unavailable:", e.codes.join(", "));
    const card = fallbackCard("unavailable", clinic.slug, k);
    const id = await w.assistant(FALLBACK_TEXT.unavailable, { card });
    items.push(...cards, { id, role: "assistant", text: FALLBACK_TEXT.unavailable, card });
    return finish(urgent ? "urgent" : row.status, { tokenCount: row.tokenCount + tokens });
  }

  const reply = finalText ?? (cards.length ? "Te dejo las opciones acá abajo." : "Perdón, no te entendí. ¿Me lo decís de otra forma?");
  const replyId = await w.assistant(redactPersonalData(reply).text);
  items.push({ id: replyId, role: "assistant", text: reply }, ...cards);
  return finish(urgent ? "urgent" : row.status === "limited" ? "active" : row.status, { tokenCount: row.tokenCount + tokens });
}

/** Patient tapped a slot button: show the confirmation card, no model call. */
export async function pickSlot(db: Db, input: { conversationId: string; secret: string; ref: string }, deps: EngineDeps = {}): Promise<TurnResult> {
  const { now } = resolveDeps(deps);
  const { row, state, clinicId } = await loadConversation(db, input.conversationId, input.secret);
  const offer = findOffer(state, input.ref);
  if (!offer) throw new DomainError("NOT_FOUND", "Ese horario ya no está en la lista. Buscá de nuevo.");
  const k = await loadClinicKnowledge(db, clinicId);
  const card = bookingCard(offer, k);
  const w = await writerFor(db, row.id, now);
  await w.user(`Elijo el horario ${offer.ref} (${card.kind === "booking" ? card.when : ""}).`);
  const text = "Perfecto. Completá tus datos acá abajo para confirmar el turno.";
  const id = await w.assistant(text, { card });
  await saveConversation(db, row, { messageCount: row.messageCount + 1 }, now);
  return { items: [{ id, role: "assistant", text, card }], status: row.status };
}

export type ConfirmResult =
  | { ok: true; items: ChatItem[] }
  | { ok: false; error: string; slotGone?: boolean; fieldErrors?: Partial<Record<"fullName" | "phone" | "email" | "consent", string>> };

/** Patient confirmed the card with their data: book through the shared public layer. */
export async function confirmBooking(
  db: Db,
  input: { conversationId: string; secret: string; ref: string; patient: PublicBookingInput["patient"]; consent: boolean },
  deps: EngineDeps = {},
): Promise<ConfirmResult> {
  const { now } = resolveDeps(deps);
  const { row, state, clinicId } = await loadConversation(db, input.conversationId, input.secret);
  const offer = findOffer(state, input.ref);
  if (!offer) return { ok: false, error: "Ese horario ya no está en la lista. Buscá de nuevo.", slotGone: true };
  if (!input.consent) return { ok: false, error: "Revisá los datos marcados.", fieldErrors: { consent: "Para reservar necesitamos que aceptes el uso de tus datos." } };

  let created;
  try {
    created = await bookPublic(
      db,
      { professionalId: offer.professionalId, locationId: offer.locationId, serviceId: offer.serviceId, startsAt: offer.startsAt, patient: input.patient, consent: true },
      { source: "ai", conversationId: row.id, now },
    );
  } catch (e) {
    if (e instanceof ZodError) {
      const fieldErrors: Partial<Record<"fullName" | "phone" | "email" | "consent", string>> = {};
      for (const issue of e.issues) {
        const key = issue.path[issue.path[0] === "patient" ? 1 : 0];
        if (key === "fullName" || key === "phone" || key === "email") fieldErrors[key] ??= issue.message;
      }
      return { ok: false, error: "Revisá los datos marcados.", fieldErrors };
    }
    if (isDomainError(e)) return { ok: false, error: e.userMessage, slotGone: e.code === "SLOT_TAKEN" || e.code === "SLOT_UNAVAILABLE" };
    throw e;
  }
  const { appointment, cancelToken } = created;
  if (appointment.clinicId !== clinicId) throw new DomainError("FORBIDDEN", "Operación no permitida.");

  const k = await loadClinicKnowledge(db, clinicId);
  const summary = bookingCard(offer, k);
  const card: ChatCard = {
    kind: "booked",
    code: appointment.code,
    when: summary.kind === "booking" ? summary.when : "",
    professional: summary.kind === "booking" ? summary.professional : "",
    location: summary.kind === "booking" ? summary.location : "",
  };
  const text = `¡Listo! Tu turno quedó confirmado. El código es ${appointment.code}.`;
  const w = await writerFor(db, row.id, now);
  const id = await w.assistant(text, { card });
  // Slots offered before this booking stop being bookable: a second appointment
  // needs a new search, so nobody books two by tapping an old card.
  state.offers = [];
  await saveConversation(db, row, { status: "booked", appointmentId: appointment.id, state }, now);
  return {
    ok: true,
    items: [{ id, role: "assistant", text, card: { ...card, href: `/turno/${appointment.code}?t=${encodeURIComponent(cancelToken)}&nuevo=1` } }],
  };
}

