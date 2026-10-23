import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { appointments, auditLog, conversations, kbDocs, llmUsage, messages, users } from "@/db/schema";
import { getConversation, listConversations } from "@/server/admin/conversations";
import { assistantConfig, type AssistantConfig } from "@/server/assistant/config";
import { confirmBooking, pickSlot, sendMessage, startConversation, sweepConversations } from "@/server/assistant/engine";
import type { CompletionRequest, CompletionResult, LlmClient } from "@/server/assistant/llm";
import { LlmUnavailableError } from "@/server/assistant/llm";
import type { ChatCard } from "@/server/assistant/types";
import type { Actor } from "@/server/auth/rbac";
import { bookPublic } from "@/server/booking/public";
import { DomainError } from "@/server/errors";
import { ar, makeFixture, patient, resetDb, testDb, type Fixture } from "./helpers";

const holder = testDb(10);
const db = holder.db;
afterAll(() => holder.sql.end());

const NOW = ar("2026-10-26", "08:00"); // Monday
const MON = "2026-11-02";
const config: AssistantConfig = { ...assistantConfig({ LLM_MOCK: "1" }), dailyTokenLimit: 0 };

let f: Fixture;
beforeEach(async () => {
  await resetDb(db);
  f = await makeFixture(db);
  await db.insert(kbDocs).values({ clinicId: f.clinic.id, question: "¿Aceptan obras sociales?", answer: "Sí, OSDE y Swiss Medical.", tags: [] });
});

const call = (name: string, args: Record<string, unknown>): CompletionResult => ({
  message: { content: null, tool_calls: [{ id: `c_${randomUUID().slice(0, 8)}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] },
  usage: { promptTokens: 100, completionTokens: 10 },
});
const say = (content: string): CompletionResult => ({ message: { content }, usage: { promptTokens: 100, completionTokens: 20 } });

/** A fake model that answers with the given steps, in order, and records what it saw. */
function scripted(...steps: CompletionResult[]) {
  const seen: CompletionRequest[] = [];
  const llm: LlmClient = vi.fn(async (req, onAttempt) => {
    seen.push(structuredClone(req));
    const step = steps.shift();
    if (!step) throw new Error("script exhausted");
    await onAttempt({ provider: "fake", model: "fake-1", ok: true, ...step.usage, latencyMs: 5 });
    return step;
  });
  return { llm, seen };
}

const start = () => startConversation(db, f.clinic.slug, "iphash", { config, now: NOW });
const cards = (items: { card?: ChatCard }[]) => items.map((i) => i.card).filter((c): c is ChatCard => !!c);

describe("assistant booking flow", () => {
  it("searches real slots with short refs, then books through the shared layer after the patient confirms", async () => {
    const s = await start();
    const { llm, seen } = scripted(call("buscar_horarios", { especialidad: "E1", desde: MON, hasta: MON }), say("Hay turnos el lunes a la mañana."));
    const r = await sendMessage(db, { ...s, text: "Quiero un turno de clínica médica el lunes 2" }, { llm, config, now: NOW });

    // The model sees the catalog with refs, the FAQ and the rules — never internal ids.
    const system = seen[0].messages[0].content as string;
    expect(system).toContain("E1: Clínica médica");
    expect(system).toContain("C1 Consulta (30 min)");
    expect(system).toContain("OSDE y Swiss Medical");
    expect(system).not.toContain(f.spec.id);
    expect(system).not.toContain(f.prof.id);

    expect(r.items[0].text).toBe("Hay turnos el lunes a la mañana.");
    const slots = cards(r.items).find((c) => c.kind === "slots");
    expect(slots?.kind).toBe("slots");
    if (slots?.kind !== "slots") return;
    expect(slots.offers.length).toBe(3); // at most 3 per day
    expect(slots.offers[0]).toMatchObject({ ref: "H1", date: MON, time: "09:00", professional: "Dra. Ana Prueba", location: "Sede A" });

    // Tapping a slot: confirmation card, no model call.
    const picked = await pickSlot(db, { ...s, ref: "H2" }, { now: NOW });
    const booking = cards(picked.items)[0];
    expect(booking).toMatchObject({ kind: "booking", ref: "H2", professional: "Dra. Ana Prueba", service: "Consulta" });

    const done = await confirmBooking(db, { ...s, ref: "H2", patient: patient(1), consent: true }, { now: NOW });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    const booked = cards(done.items)[0];
    expect(booked.kind).toBe("booked");
    if (booked.kind !== "booked") return;
    expect(booked.href).toMatch(/^\/turno\/T-[A-Z0-9]{6}\?t=.+&nuevo=1$/);

    const [appt] = await db.select().from(appointments);
    expect(appt).toMatchObject({ source: "ai", conversationId: s.conversationId, startsAt: ar(MON, "09:30") });
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, s.conversationId));
    expect(conv).toMatchObject({ status: "booked", appointmentId: appt.id, tokenCount: 230 });

    // The cancel-token link is returned once and never stored.
    const token = new URL(booked.href!, "http://x").searchParams.get("t")!;
    const stored = await db.select().from(messages).where(eq(messages.conversationId, s.conversationId));
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(await db.select().from(llmUsage).where(eq(llmUsage.conversationId, s.conversationId))).toHaveLength(2);

    // Old cards stop working: a second appointment needs a new search.
    await expect(pickSlot(db, { ...s, ref: "H3" }, { now: NOW })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await confirmBooking(db, { ...s, ref: "H3", patient: patient(1), consent: true }, { now: NOW })).toMatchObject({ ok: false, slotGone: true });
    expect(await db.select().from(appointments)).toHaveLength(1);
  });

  it("keeps the conversation as context for the next turn (tool calls and results included)", async () => {
    const s = await start();
    const first = scripted(call("buscar_horarios", { especialidad: "E1", desde: MON }), say("Te muestro horarios."));
    await sendMessage(db, { ...s, text: "clínica médica" }, { llm: first.llm, config, now: NOW });
    const second = scripted(call("ofrecer_reserva", { horario: "H1" }), say("Completá tus datos."));
    const r = await sendMessage(db, { ...s, text: "el primero" }, { llm: second.llm, config, now: NOW });
    const roles = second.seen[0].messages.map((m) => m.role);
    expect(roles).toEqual(["system", "assistant", "user", "assistant", "tool", "assistant", "user"]);
    expect(cards(r.items)[0]).toMatchObject({ kind: "booking", ref: "H1" });
  });

  it("rejects slot refs and catalog refs the model made up", async () => {
    const s = await start();
    const { llm, seen } = scripted(call("ofrecer_reserva", { horario: "H7" }), call("buscar_horarios", { especialidad: "E9" }), say("Perdón."));
    const r = await sendMessage(db, { ...s, text: "dame el de las 10" }, { llm, config, now: NOW });
    expect(cards(r.items)).toEqual([]);
    const toolResults = seen[2].messages.filter((m) => m.role === "tool").map((m) => JSON.parse(m.content as string));
    expect(toolResults[0].error).toMatch(/no existe/);
    expect(toolResults[1].error).toMatch(/E9/);
    await expect(confirmBooking(db, { ...s, ref: "H7", patient: patient(1), consent: true }, { now: NOW })).resolves.toMatchObject({ ok: false, slotGone: true });
    expect(await db.select().from(appointments)).toHaveLength(0);
  });

  it("stops after the configured number of model calls", async () => {
    const s = await start();
    const loop = Array.from({ length: 10 }, () => call("buscar_horarios", { especialidad: "E1" }));
    const { llm } = scripted(...loop);
    const r = await sendMessage(db, { ...s, text: "clínica médica" }, { llm, config: { ...config, maxToolRounds: 2 }, now: NOW });
    expect(llm).toHaveBeenCalledTimes(2);
    expect(r.items[0].text).toBe("Te dejo las opciones acá abajo.");
  });

  it("requires consent, valid data and a free slot", async () => {
    const s = await start();
    const { llm } = scripted(call("buscar_horarios", { especialidad: "E1", desde: MON, hasta: MON }), say("ok"));
    await sendMessage(db, { ...s, text: "clínica médica" }, { llm, config, now: NOW });

    expect(await confirmBooking(db, { ...s, ref: "H1", patient: patient(1), consent: false }, { now: NOW })).toMatchObject({ ok: false, fieldErrors: { consent: expect.any(String) } });
    expect(await confirmBooking(db, { ...s, ref: "H1", patient: { ...patient(1), phone: "123" }, consent: true }, { now: NOW })).toMatchObject({ ok: false, fieldErrors: { phone: expect.any(String) } });

    // Someone else takes the slot through the form meanwhile.
    await bookPublic(db, { professionalId: f.prof.id, locationId: f.locA.id, serviceId: f.svc.id, startsAt: ar(MON, "09:00"), patient: patient(2), consent: true }, { source: "form", now: NOW });
    expect(await confirmBooking(db, { ...s, ref: "H1", patient: patient(1), consent: true }, { now: NOW })).toMatchObject({ ok: false, slotGone: true });
    expect(await db.select().from(appointments)).toHaveLength(1);
  });

  it("rejects a wrong conversation secret", async () => {
    const s = await start();
    const { llm } = scripted(say("hola"));
    await expect(sendMessage(db, { conversationId: s.conversationId, secret: "nope", text: "hola" }, { llm, config, now: NOW })).rejects.toBeInstanceOf(DomainError);
    await expect(pickSlot(db, { conversationId: randomUUID(), secret: s.secret, ref: "H1" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(llm).not.toHaveBeenCalled();
  });
});

describe("assistant safety and limits", () => {
  it("answers emergencies without calling the model", async () => {
    const s = await start();
    const { llm } = scripted();
    const r = await sendMessage(db, { ...s, text: "Mi papá tiene un dolor fuerte en el pecho y no puede respirar" }, { llm, config, now: NOW });
    expect(llm).not.toHaveBeenCalled();
    expect(r.status).toBe("urgent");
    expect(cards(r.items)[0]).toMatchObject({ kind: "emergency", message: expect.stringContaining("911") });
  });

  it("removes phones and emails before saving and before the model sees them", async () => {
    const s = await start();
    const { llm, seen } = scripted(say("No hace falta, el formulario te los pide."));
    await sendMessage(db, { ...s, text: "Soy Ana, mi cel es 11 5555-1234 y mi mail ana@example.com" }, { llm, config, now: NOW });
    const userMsg = seen[0].messages.at(-1)!;
    expect(userMsg.content).toBe("Soy Ana, mi cel es [número] y mi mail [email]");
    const stored = await db.select().from(messages).where(eq(messages.role, "user"));
    expect(stored[0].content).not.toMatch(/5555|example\.com/);
  });

  it("switches to the form when the daily token limit is reached", async () => {
    const s = await start();
    await db.insert(llmUsage).values({ provider: "groq", model: "m", promptTokens: 900, completionTokens: 200, ok: true, createdAt: new Date(NOW.getTime() - 3_600_000) });
    const { llm } = scripted(say("no debería"));
    const r = await sendMessage(db, { ...s, text: "clínica médica" }, { llm, config: { ...config, dailyTokenLimit: 1000 }, now: NOW });
    expect(llm).not.toHaveBeenCalled();
    expect(r.status).toBe("limited");
    expect(cards(r.items)[0]).toMatchObject({ kind: "fallback", reason: "limit", formHref: `/reservar?clinica=${encodeURIComponent(f.clinic.slug)}` });
  });

  it("yesterday's usage does not count for today's limit", async () => {
    const s = await start();
    await db.insert(llmUsage).values({ provider: "groq", model: "m", promptTokens: 5000, completionTokens: 0, ok: true, createdAt: ar("2026-10-25", "23:00") });
    const { llm } = scripted(say("¡Hola!"));
    const r = await sendMessage(db, { ...s, text: "hola" }, { llm, config: { ...config, dailyTokenLimit: 1000 }, now: NOW });
    expect(llm).toHaveBeenCalledOnce();
    expect(r.status).toBe("active");
  });

  it("caps messages per conversation", async () => {
    const s = await start();
    const { llm } = scripted(say("1"), say("2"));
    const cfg = { ...config, conversationMessageLimit: 2 };
    await sendMessage(db, { ...s, text: "a" }, { llm, config: cfg, now: NOW });
    await sendMessage(db, { ...s, text: "b" }, { llm, config: cfg, now: NOW });
    const r = await sendMessage(db, { ...s, text: "c" }, { llm, config: cfg, now: NOW });
    expect(llm).toHaveBeenCalledTimes(2);
    expect(cards(r.items)[0]).toMatchObject({ kind: "fallback", reason: "limit" });
  });

  it("offers the form and the phone when every provider fails", async () => {
    const s = await start();
    const llm: LlmClient = async (_req, onAttempt) => {
      await onAttempt({ provider: "groq", model: "m", ok: false, promptTokens: 0, completionTokens: 0, latencyMs: 20000, errorCode: "TIMEOUT" });
      throw new LlmUnavailableError(["groq:TIMEOUT"]);
    };
    const r = await sendMessage(db, { ...s, text: "hola" }, { llm, config, now: NOW });
    expect(cards(r.items)[0]).toMatchObject({ kind: "fallback", reason: "unavailable", phone: "011 4000-0000" });
    const [u] = await db.select().from(llmUsage);
    expect(u).toMatchObject({ ok: false, errorCode: "TIMEOUT", conversationId: s.conversationId });
  });

  it("deletes conversations past retention and marks idle ones as abandoned", async () => {
    const old = await startConversation(db, f.clinic.slug, null, { config, now: ar("2026-06-01", "10:00") });
    const idle = await startConversation(db, f.clinic.slug, null, { config, now: ar("2026-10-24", "10:00") });
    const fresh = await start();
    await db.insert(llmUsage).values({ conversationId: old.conversationId, provider: "groq", model: "m", ok: true });
    const r = await sweepConversations(db, 90, NOW);
    expect(r.deleted).toBe(1);
    const rows = await db.select({ id: conversations.id, status: conversations.status }).from(conversations);
    expect(rows.find((x) => x.id === old.conversationId)).toBeUndefined();
    expect(rows.find((x) => x.id === idle.conversationId)?.status).toBe("abandoned");
    expect(rows.find((x) => x.id === fresh.conversationId)?.status).toBe("active");
    // Usage stats survive without the conversation.
    expect(await db.select().from(llmUsage)).toHaveLength(1);
  });
});

describe("conversations in the panel", () => {
  async function mkUser(role: Actor["role"], clinicId: string | null): Promise<Actor> {
    const id = randomUUID();
    const u = { id, name: `${role} user`, email: `${role}-${id}@x.example`, role, clinicId };
    await db.insert(users).values({ ...u, active: true });
    return u;
  }

  it("clinic admins read their clinic's transcripts (audited); staff and other clinics cannot", async () => {
    const other = await makeFixture(db);
    const admin = await mkUser("clinic_admin", f.clinic.id);
    const staff = await mkUser("staff", f.clinic.id);
    const otherAdmin = await mkUser("clinic_admin", other.clinic.id);
    const s = await start();
    const { llm } = scripted(call("buscar_horarios", { especialidad: "E1" }), say("Listo."));
    await sendMessage(db, { ...s, text: "clínica médica" }, { llm, config, now: NOW });

    const list = await listConversations(db, admin, f.clinic.id, {});
    expect(list.rows.map((r) => r.id)).toEqual([s.conversationId]);
    const c = await getConversation(db, admin, s.conversationId);
    expect(c.transcript.map((e) => e.kind)).toEqual(["assistant", "user", "tool", "assistant"]);
    expect(c.usage).toHaveLength(2);
    const [log] = await db.select().from(auditLog).where(eq(auditLog.action, "conversation.viewed"));
    expect(log).toMatchObject({ userId: admin.id, entityId: s.conversationId });

    await expect(getConversation(db, staff, s.conversationId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getConversation(db, otherAdmin, s.conversationId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listConversations(db, otherAdmin, f.clinic.id, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
