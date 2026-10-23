/**
 * Assistant conversations for the panel (read-only), scoped to the clinic.
 * Patient messages are stored already redacted; opening a transcript is audited.
 */
import { and, asc, count, desc, eq, gte, lt, type SQL } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appointments, conversations, conversationStatus, llmUsage, messages } from "@/db/schema";
import { addDays, localToUtc } from "@/lib/time";
import { assertCan, type Actor } from "@/server/auth/rbac";
import { getClinicContext } from "@/server/clinics/settings";
import { DomainError } from "@/server/errors";
import type { ChatCard } from "@/server/assistant/types";
import { audit } from "./audit";
import { pageParams } from "./common";

type ConversationStatus = (typeof conversationStatus.enumValues)[number];

export type ConversationFilters = { from?: string; to?: string; status?: string };

export async function listConversations(db: Db, actor: Actor, clinicId: string, f: ConversationFilters, page = 1) {
  assertCan(actor, "read", "conversations", clinicId);
  const { clinic } = await getClinicContext(db, clinicId);
  const tz = clinic.timezone;
  const conds: SQL[] = [eq(conversations.clinicId, clinicId)];
  const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (isDate(f.from)) conds.push(gte(conversations.lastMessageAt, localToUtc(f.from!, 0, tz)));
  if (isDate(f.to)) conds.push(lt(conversations.lastMessageAt, localToUtc(addDays(f.to!, 1), 0, tz)));
  if (f.status && (conversationStatus.enumValues as readonly string[]).includes(f.status)) {
    conds.push(eq(conversations.status, f.status as ConversationStatus));
  }
  const where = and(...conds);
  const { limit, offset } = pageParams(page);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: conversations.id,
        status: conversations.status,
        createdAt: conversations.createdAt,
        lastMessageAt: conversations.lastMessageAt,
        messageCount: conversations.messageCount,
        tokenCount: conversations.tokenCount,
        appointmentId: conversations.appointmentId,
        appointmentCode: appointments.code,
      })
      .from(conversations)
      .leftJoin(appointments, eq(appointments.id, conversations.appointmentId))
      .where(where)
      .orderBy(desc(conversations.lastMessageAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(conversations).where(where),
  ]);
  return { rows, total, timezone: tz };
}

export type TranscriptEntry =
  | { kind: "user" | "assistant"; id: string; at: Date; text: string; card?: ChatCard }
  | { kind: "tool"; id: string; at: Date; name: string; args: string; result: string; card?: ChatCard };

export async function getConversation(db: Db, actor: Actor, id: string) {
  assertCan(actor, "read", "conversations");
  const ok = /^[0-9a-f-]{36}$/i.test(id);
  const [conv] = ok ? await db.select().from(conversations).where(eq(conversations.id, id)) : [];
  if (!conv) throw new DomainError("NOT_FOUND", "No encontramos esa conversación.");
  assertCan(actor, "read", "conversations", conv.clinicId);
  const { clinic } = await getClinicContext(db, conv.clinicId!);

  const [rows, usage, appt] = await Promise.all([
    db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.createdAt)),
    db.select().from(llmUsage).where(eq(llmUsage.conversationId, id)).orderBy(asc(llmUsage.createdAt)),
    conv.appointmentId
      ? db.select({ id: appointments.id, code: appointments.code, status: appointments.status }).from(appointments).where(eq(appointments.id, conv.appointmentId))
      : Promise.resolve([]),
  ]);

  const transcript: TranscriptEntry[] = [];
  for (const m of rows) {
    const p = (m.payload ?? {}) as { card?: ChatCard; arguments?: string; tool_calls?: unknown[] };
    if (m.role === "tool") {
      transcript.push({ kind: "tool", id: m.id, at: m.createdAt, name: m.toolName ?? "", args: p.arguments ?? "{}", result: m.content, card: p.card });
    } else if (m.role === "user" || m.role === "assistant") {
      // Assistant turns that only requested tools carry no visible text.
      if (m.role === "assistant" && !m.content && !p.card) continue;
      transcript.push({ kind: m.role, id: m.id, at: m.createdAt, text: m.content, card: p.card });
    }
  }

  await audit(db, actor, { action: "conversation.viewed", entity: "conversation", entityId: id, clinicId: conv.clinicId });
  return { conversation: conv, timezone: clinic.timezone, transcript, usage, appointment: appt[0] ?? null };
}
