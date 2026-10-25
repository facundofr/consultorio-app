import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { appointmentEvents, appointments, emailOutbox, patients } from "@/db/schema";
import { createAppointment } from "@/server/appointments/create";
import { cancelAppointment, rescheduleAppointment } from "@/server/appointments/manage";
import { decodePayload, type EmailPayload } from "@/server/email/outbox";
import { flushOutbox, MAX_ATTEMPTS, purgeOutbox, queueReminders, type MailConfig } from "@/server/email/worker";
import { ar, makeFixture, patient, resetDb, testDb, type Fixture } from "./helpers";

const holder = testDb(20);
const db = holder.db;
afterAll(() => holder.sql.end());

const NOW = ar("2026-10-26", "08:00");
const MON = "2026-11-02";
const H = 3_600_000;
const preview: MailConfig = { mode: "preview" };

let f: Fixture;
beforeEach(async () => {
  await resetDb(db);
  f = await makeFixture(db);
});

const book = (startsAt: Date, n = 1, now = NOW) =>
  createAppointment(
    db,
    { professionalId: f.prof.id, locationId: f.locA.id, serviceId: f.svc.id, startsAt, patient: patient(n), consent: true },
    { source: "form", now },
  );

const outbox = () => db.select().from(emailOutbox).orderBy(emailOutbox.createdAt);

function capture() {
  const sent: EmailPayload[] = [];
  const cfg: MailConfig = { mode: "smtp", from: "turnos@test", send: async (m) => void sent.push(m) };
  return { sent, cfg };
}

describe("confirmation email", () => {
  it("is queued with the booking, encrypted, with the one-click link and the calendar file", async () => {
    const { appointment, cancelToken } = await book(ar(MON, "10:00"));
    const rows = await outbox();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "confirmation", status: "pending", appointmentId: appointment.id });
    // Nothing readable at rest: neither the address nor the token.
    expect(rows[0].payloadEnc).not.toContain("paciente1@example.com");
    expect(rows[0].payloadEnc).not.toContain(cancelToken);
    expect(rows[0].subjectPreview).not.toContain("Paciente");

    const p = decodePayload(rows[0].payloadEnc!);
    expect(p.to).toBe("paciente1@example.com");
    expect(p.subject).toMatch(/^Turno confirmado: lun 2\/11, 10:00 h · Dra\. Ana Prueba$/);
    expect(p.html).toContain(`/turno/${appointment.code}?t=${encodeURIComponent(cancelToken)}`);
    expect(p.text).toContain("Ver o cancelar mi turno");
    expect(p.attachments?.[0].filename).toBe(`turno-${appointment.code}.ics`);
    expect(p.attachments?.[0].content).toContain("METHOD:PUBLISH");
  });

  it("is not queued when the booking fails", async () => {
    await book(ar(MON, "10:00"), 1);
    await expect(book(ar(MON, "10:00"), 2)).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
    expect(await outbox()).toHaveLength(1);
  });

  it("escapes what patients type", async () => {
    await createAppointment(
      db,
      { professionalId: f.prof.id, locationId: f.locA.id, serviceId: f.svc.id, startsAt: ar(MON, "10:00"), patient: { ...patient(1), fullName: "<script>x</script> Pérez" }, consent: true },
      { source: "form", now: NOW },
    );
    const p = decodePayload((await outbox())[0].payloadEnc!);
    expect(p.html).not.toContain("<script>");
    expect(p.html).toContain("&lt;script&gt;");
  });
});

describe("sending", () => {
  it("preview mode keeps the message for the panel and records it", async () => {
    const { appointment } = await book(ar(MON, "10:00"));
    expect(await flushOutbox(db, { now: NOW, config: preview })).toMatchObject({ preview: 1 });
    const [row] = await outbox();
    expect(row.status).toBe("preview");
    expect(row.payloadEnc).not.toBeNull();
    const events = await db.select().from(appointmentEvents).where(and(eq(appointmentEvents.appointmentId, appointment.id), eq(appointmentEvents.type, "email_sent")));
    expect(events).toHaveLength(1);
  });

  it("SMTP: sends once and wipes the content", async () => {
    await book(ar(MON, "10:00"));
    const { sent, cfg } = capture();
    expect(await flushOutbox(db, { now: NOW, config: cfg })).toMatchObject({ sent: 1 });
    expect(await flushOutbox(db, { now: new Date(NOW.getTime() + H), config: cfg })).toMatchObject({ sent: 0 });
    expect(sent).toHaveLength(1);
    const [row] = await outbox();
    expect(row).toMatchObject({ status: "sent", payloadEnc: null });
  });

  it("retries with growing waits, then gives up; errors never keep the address", async () => {
    await book(ar(MON, "10:00"));
    const failing: MailConfig = { mode: "smtp", from: "x", send: async () => { throw new Error("550 mailbox paciente1@example.com unavailable"); } };
    let t = NOW.getTime();
    for (let i = 1; i <= MAX_ATTEMPTS; i++) {
      const r = await flushOutbox(db, { now: new Date(t), config: failing });
      expect(r.retry + r.failed).toBe(1);
      const [row] = await outbox();
      expect(row.attempts).toBe(i);
      expect(row.lastError).not.toContain("paciente1@example.com");
      // Not due again right away.
      expect((await flushOutbox(db, { now: new Date(t + 1000), config: failing })).retry).toBe(0);
      t = row.nextAttemptAt.getTime();
    }
    expect((await outbox())[0].status).toBe("failed");
  });

  it("a worker that dies mid-send does not lose the email", async () => {
    await book(ar(MON, "10:00"));
    // Simulate a crash: claimed as "sending" and never finished.
    await db.update(emailOutbox).set({ status: "sending", nextAttemptAt: new Date(NOW.getTime() + 10 * 60_000) });
    const { sent, cfg } = capture();
    expect((await flushOutbox(db, { now: new Date(NOW.getTime() + 5 * 60_000), config: cfg })).sent).toBe(0);
    expect((await flushOutbox(db, { now: new Date(NOW.getTime() + 11 * 60_000), config: cfg })).sent).toBe(1);
    expect(sent).toHaveLength(1);
  });

  it("two workers at the same time send each email once", async () => {
    for (let i = 0; i < 6; i++) await book(ar(MON, `${String(9 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`), i + 1);
    const { sent, cfg } = capture();
    await Promise.all([flushOutbox(db, { now: NOW, config: cfg }), flushOutbox(db, { now: NOW, config: cfg }), flushOutbox(db, { now: NOW, config: cfg })]);
    expect(sent).toHaveLength(6);
    expect(new Set(sent.map((s) => s.to)).size).toBe(6);
  });
});

describe("changes", () => {
  it("patient cancellation, clinic cancellation and moves each send their email", async () => {
    const a = await book(ar(MON, "10:00"), 1);
    const b = await book(ar(MON, "11:00"), 2);
    await cancelAppointment(db, a.appointment.id, { kind: "patient", channel: "link" }, NOW);
    await cancelAppointment(db, b.appointment.id, { kind: "admin", userId: "u1" }, NOW);
    const c = await book(ar(MON, "12:00"), 3);
    await rescheduleAppointment(db, c.appointment.id, { startsAt: ar("2026-11-03", "10:00") }, { userId: "u1" }, NOW);

    const rows = (await outbox()).filter((r) => r.kind !== "confirmation");
    const byKind = Object.fromEntries(rows.map((r) => [`${r.kind}:${r.appointmentId}`, decodePayload(r.payloadEnc!)]));
    const pa = byKind[`cancellation:${a.appointment.id}`];
    const pb = byKind[`cancellation:${b.appointment.id}`];
    const pc = byKind[`rescheduled:${c.appointment.id}`];
    expect(pa.html).toContain("cancelaste tu turno");
    expect(pa.html).toContain("Sacar otro turno");
    expect(pa.attachments?.[0].content).toContain("METHOD:CANCEL");
    expect(pb.html).toContain("la clínica canceló tu turno");
    expect(pc.subject).toContain("mar 3/11, 10:00 h");
    expect(pc.text).toContain("Antes: lunes, 2 de noviembre, 12:00 h");
  });

  it("patients without email get nothing", async () => {
    const { appointment } = await book(ar(MON, "10:00"));
    await db.update(patients).set({ emailEnc: null, emailHash: null });
    await db.delete(emailOutbox);
    await cancelAppointment(db, appointment.id, { kind: "admin", userId: "u1" }, NOW);
    expect(await outbox()).toHaveLength(0);
  });
});

describe("reminders", () => {
  it("queues one reminder inside the window, never twice", async () => {
    const start = ar(MON, "10:00");
    const { appointment } = await book(start);
    // 49 h before: outside the default 48 h window.
    expect((await queueReminders(db, new Date(start.getTime() - 49 * H))).queued).toBe(0);
    const inWindow = new Date(start.getTime() - 47 * H);
    expect((await queueReminders(db, inWindow)).queued).toBe(1);
    expect((await queueReminders(db, new Date(inWindow.getTime() + H))).queued).toBe(0);
    const reminders = (await outbox()).filter((r) => r.kind === "reminder");
    expect(reminders).toHaveLength(1);
    const p = decodePayload(reminders[0].payloadEnc!);
    expect(p.subject).toBe("Recordatorio: tu turno es el lun 2/11, 10:00 h");
    expect(p.html).toContain("¿No podés ir? Cancelalo");
    const [row] = await db.select().from(appointments).where(eq(appointments.id, appointment.id));
    expect(row.reminderSentAt).not.toBeNull();
  });

  it("concurrent runs queue a single reminder", async () => {
    const start = ar(MON, "10:00");
    await book(start);
    const at = new Date(start.getTime() - 24 * H);
    await Promise.all([queueReminders(db, at), queueReminders(db, at), queueReminders(db, at)]);
    expect((await outbox()).filter((r) => r.kind === "reminder")).toHaveLength(1);
  });

  it("skips the reminder when the booking itself was made inside the window", async () => {
    const start = ar(MON, "10:00");
    const { appointment } = await book(start);
    // The booking happened 10 h before the appointment.
    await db.update(appointmentEvents).set({ createdAt: new Date(start.getTime() - 10 * H) }).where(eq(appointmentEvents.appointmentId, appointment.id));
    expect(await queueReminders(db, new Date(start.getTime() - 5 * H))).toMatchObject({ queued: 0, skipped: 1 });
    expect((await outbox()).filter((r) => r.kind === "reminder")).toHaveLength(0);
  });

  it("past the cancellation deadline the reminder points to the phone", async () => {
    const start = ar(MON, "10:00");
    await book(start);
    await queueReminders(db, new Date(start.getTime() - 12 * H));
    const p = decodePayload((await outbox()).find((r) => r.kind === "reminder")!.payloadEnc!);
    expect(p.text).toContain("Ya no se puede cancelar online");
    expect(p.text).toContain("011 4000-0000");
  });

  it("cancelled appointments get no reminder", async () => {
    const start = ar(MON, "10:00");
    const { appointment } = await book(start);
    await cancelAppointment(db, appointment.id, { kind: "admin", userId: "u1" }, NOW);
    expect((await queueReminders(db, new Date(start.getTime() - 24 * H))).queued).toBe(0);
  });
});

describe("purge", () => {
  it("wipes old preview content and keeps the row", async () => {
    await book(ar(MON, "10:00"));
    await flushOutbox(db, { now: NOW, config: preview });
    await db.update(emailOutbox).set({ createdAt: new Date(NOW.getTime() - 8 * 24 * H) });
    expect(await purgeOutbox(db, NOW)).toMatchObject({ wiped: 1, deleted: 0 });
    expect((await outbox())[0].payloadEnc).toBeNull();
  });
});
