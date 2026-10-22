import { and, asc, count, desc, eq, gt, gte, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  appointments,
  auditLog,
  conversations,
  llmUsage,
  locations,
  patients,
  professionalLocations,
  professionals,
  services,
  users,
} from "@/db/schema";
import { addDays, localToUtc, utcToLocal } from "@/lib/time";
import { computeOpenWindows } from "@/server/availability/engine";
import { loadScheduleData } from "@/server/availability/service";
import { assertCan, can, type Actor } from "@/server/auth/rbac";
import { getClinicContext } from "@/server/clinics/settings";
import { pageParams } from "./common";
import { professionalDisplayName } from "./professionals";
import { weekStart } from "./agenda";

const OCCUPYING = ["confirmed", "completed", "no_show"] as const;

/** Booked minutes / open minutes for every active professional of the clinic. */
export async function occupancy(db: Db, clinicId: string, from: Date, to: Date, tz: string) {
  const profs = await db
    .select({ id: professionals.id })
    .from(professionals)
    .where(and(eq(professionals.clinicId, clinicId), eq(professionals.active, true), isNull(professionals.deletedAt)));
  let openMin = 0;
  for (const p of profs) {
    const locs = (await db.select({ id: professionalLocations.locationId }).from(professionalLocations).where(eq(professionalLocations.professionalId, p.id))).map((l) => l.id);
    const data = await loadScheduleData(db, { clinicId, professionalId: p.id, professionalLocationIds: locs, allowedLocationIds: locs, from, to });
    for (const w of computeOpenWindows({ timezone: tz, from, to, rules: data.rules, exceptions: data.exceptions })) {
      openMin += (w.end.getTime() - w.start.getTime()) / 60_000;
    }
  }
  const [{ booked }] = await db
    .select({
      booked: sql<number>`coalesce(sum(extract(epoch from (least(${appointments.endsAt}, ${to.toISOString()}::timestamptz) - greatest(${appointments.startsAt}, ${from.toISOString()}::timestamptz))) / 60), 0)::float`,
    })
    .from(appointments)
    .where(and(eq(appointments.clinicId, clinicId), inArray(appointments.status, [...OCCUPYING]), lt(appointments.startsAt, to), gt(appointments.endsAt, from)));
  return { openMinutes: Math.round(openMin), bookedMinutes: Math.round(booked), rate: openMin > 0 ? Math.min(1, booked / openMin) : null };
}

export async function getDashboard(db: Db, actor: Actor, clinicId: string, now: Date = new Date()) {
  assertCan(actor, "read", "dashboard", clinicId);
  const { clinic } = await getClinicContext(db, clinicId);
  const tz = clinic.timezone;
  const today = utcToLocal(now, tz).date;
  const dayStart = localToUtc(today, 0, tz);
  const dayEnd = localToUtc(addDays(today, 1), 0, tz);
  const wkStart = localToUtc(weekStart(today), 0, tz);
  const wkEnd = localToUtc(addDays(weekStart(today), 7), 0, tz);
  const since30 = new Date(now.getTime() - 30 * 86_400_000);
  const since7 = new Date(now.getTime() - 7 * 86_400_000);

  const todayRows = await db
    .select({
      id: appointments.id,
      code: appointments.code,
      startsAt: appointments.startsAt,
      status: appointments.status,
      source: appointments.source,
      patientName: patients.fullName,
      serviceName: services.name,
      locationName: locations.name,
      pTitle: professionals.title,
      pFirst: professionals.firstName,
      pLast: professionals.lastName,
    })
    .from(appointments)
    .innerJoin(patients, eq(patients.id, appointments.patientId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .innerJoin(locations, eq(locations.id, appointments.locationId))
    .innerJoin(professionals, eq(professionals.id, appointments.professionalId))
    .where(and(eq(appointments.clinicId, clinicId), gte(appointments.startsAt, dayStart), lt(appointments.startsAt, dayEnd)))
    .orderBy(asc(appointments.startsAt));

  const [occToday, occWeek] = await Promise.all([occupancy(db, clinicId, dayStart, dayEnd, tz), occupancy(db, clinicId, wkStart, wkEnd, tz)]);

  const bySource = await db
    .select({ source: appointments.source, n: count() })
    .from(appointments)
    .where(and(eq(appointments.clinicId, clinicId), gte(appointments.createdAt, since30)))
    .groupBy(appointments.source);

  const byStatus = await db
    .select({ status: appointments.status, n: count() })
    .from(appointments)
    .where(and(eq(appointments.clinicId, clinicId), gte(appointments.startsAt, since30), lt(appointments.startsAt, now)))
    .groupBy(appointments.status);

  const [{ cancelled30 }] = await db
    .select({ cancelled30: count() })
    .from(appointments)
    .where(and(eq(appointments.clinicId, clinicId), gte(appointments.cancelledAt, since30)));

  // LLM usage: conversations of this clinic (superadmins also see unattributed ones).
  const llmConds: SQL[] = [gte(llmUsage.createdAt, since7)];
  const clinicConvs = db.select({ id: conversations.id }).from(conversations).where(eq(conversations.clinicId, clinicId));
  llmConds.push(actor.role === "superadmin" ? sql`(${llmUsage.conversationId} is null or ${llmUsage.conversationId} in ${clinicConvs})` : inArray(llmUsage.conversationId, clinicConvs));
  const llm = await db
    .select({
      provider: llmUsage.provider,
      calls: count(),
      errors: sql<number>`count(*) filter (where not ${llmUsage.ok})::int`,
      tokens: sql<number>`coalesce(sum(${llmUsage.promptTokens} + ${llmUsage.completionTokens}), 0)::int`,
      avgLatency: sql<number>`coalesce(avg(${llmUsage.latencyMs}), 0)::int`,
    })
    .from(llmUsage)
    .where(and(...llmConds))
    .groupBy(llmUsage.provider);

  return {
    timezone: tz,
    today,
    todayAppointments: todayRows.map((r) => ({ ...r, professionalName: professionalDisplayName({ title: r.pTitle, firstName: r.pFirst, lastName: r.pLast }) })),
    occupancy: { today: occToday, week: occWeek },
    bySource: Object.fromEntries(bySource.map((r) => [r.source, r.n])) as Partial<Record<"ai" | "form" | "admin", number>>,
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.n])) as Partial<Record<(typeof appointments.status.enumValues)[number], number>>,
    cancelled30,
    llm,
    canSeeLlm: can(actor, "read", "conversations"),
  };
}

export async function listAudit(
  db: Db,
  actor: Actor,
  clinicId: string | null,
  opts: { entity?: string; action?: string; page?: number } = {},
) {
  assertCan(actor, "read", "audit", actor.role === "superadmin" ? undefined : clinicId);
  const conds: SQL[] = [];
  if (actor.role !== "superadmin" || clinicId) conds.push(eq(auditLog.clinicId, clinicId ?? actor.clinicId!));
  if (opts.entity) conds.push(eq(auditLog.entity, opts.entity));
  if (opts.action) conds.push(eq(auditLog.action, opts.action));
  const { limit, offset } = pageParams(opts.page);
  const where = conds.length ? and(...conds) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(auditLog).where(where);
  const rows = await db
    .select({ log: auditLog, userName: users.name, userEmail: users.email })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .where(where)
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)
    .offset(offset);
  return { total, rows };
}
