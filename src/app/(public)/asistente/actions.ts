"use server";

import { getDb } from "@/db/client";
import { confirmBooking, pickSlot, sendMessage, startConversation } from "@/server/assistant/engine";
import type { ChatItem } from "@/server/assistant/types";
import { isDomainError } from "@/server/errors";
import { rateLimit } from "@/server/security/rate-limit";
import { clientIpHash } from "@/server/security/request";

export type ChatSession = { conversationId: string; secret: string };

export type ChatResponse = { ok: true; session: ChatSession; items: ChatItem[] } | { ok: false; error: string; expired?: boolean };

const BUSY = "Mandaste muchos mensajes seguidos. Esperá unos minutos o usá el formulario.";

function failure(e: unknown): ChatResponse {
  if (isDomainError(e)) return { ok: false, error: e.userMessage, expired: e.code === "NOT_FOUND" };
  console.error("[assistant] unexpected error:", e instanceof Error ? e.message : "unknown");
  return { ok: false, error: "Algo falló de nuestro lado. Probá de nuevo o usá el formulario." };
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Send a message. Without a session, the conversation starts here (lazily). */
export async function sendChatAction(clinicSlug: string, session: ChatSession | null, text: string): Promise<ChatResponse> {
  const ip = await clientIpHash();
  if (!rateLimit(`chat:msg:${ip}`, 30, 10 * 60_000).ok) return { ok: false, error: BUSY };
  const db = getDb();
  try {
    let s = session && typeof session.conversationId === "string" ? { conversationId: str(session.conversationId, 40), secret: str(session.secret, 100) } : null;
    if (!s) {
      if (!rateLimit(`chat:new:${ip}`, 10, 60 * 60_000).ok) return { ok: false, error: BUSY };
      const started = await startConversation(db, str(clinicSlug, 100), ip);
      s = { conversationId: started.conversationId, secret: started.secret };
    }
    const r = await sendMessage(db, { ...s, text: str(text, 2000) });
    return { ok: true, session: s, items: r.items };
  } catch (e) {
    return failure(e);
  }
}

export async function pickSlotAction(session: ChatSession, ref: string): Promise<ChatResponse> {
  const ip = await clientIpHash();
  if (!rateLimit(`chat:msg:${ip}`, 30, 10 * 60_000).ok) return { ok: false, error: BUSY };
  try {
    const s = { conversationId: str(session?.conversationId, 40), secret: str(session?.secret, 100) };
    const r = await pickSlot(getDb(), { ...s, ref: str(ref, 10) });
    return { ok: true, session: s, items: r.items };
  } catch (e) {
    return failure(e);
  }
}

export type ChatBookState = {
  error?: string;
  slotGone?: boolean;
  fieldErrors?: Partial<Record<"fullName" | "phone" | "email" | "consent", string>>;
  values?: { fullName: string; phone: string; email: string; consent: boolean };
  items?: ChatItem[];
  seq?: number;
};

export async function confirmChatBookingAction(session: ChatSession, ref: string, _: ChatBookState, fd: FormData): Promise<ChatBookState> {
  const values = {
    fullName: String(fd.get("fullName") ?? "").slice(0, 200),
    phone: String(fd.get("phone") ?? "").slice(0, 60),
    email: String(fd.get("email") ?? "").slice(0, 200),
    consent: fd.get("consent") === "on",
  };
  const seq = Date.now();
  // Honeypot: real people never fill this hidden field.
  if (String(fd.get("website") ?? "")) return { error: "No pudimos procesar la reserva.", values, seq };
  if (!rateLimit(`book:${await clientIpHash()}`, 10, 60 * 60_000).ok) {
    return { error: "Hiciste muchas reservas seguidas. Probá de nuevo en un rato o llamá a la clínica.", values, seq };
  }
  try {
    const r = await confirmBooking(getDb(), {
      conversationId: str(session?.conversationId, 40),
      secret: str(session?.secret, 100),
      ref: str(ref, 10),
      patient: { fullName: values.fullName, phone: values.phone, email: values.email },
      consent: values.consent,
    });
    if (!r.ok) return { error: r.error, slotGone: r.slotGone, fieldErrors: r.fieldErrors, values, seq };
    return { items: r.items, seq };
  } catch (e) {
    const f = failure(e);
    return { error: f.ok ? undefined : f.error, values, seq };
  }
}
