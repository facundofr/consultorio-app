import { describe, expect, it } from "vitest";
import { checkPatientCancellation } from "./manage";

const START = new Date("2026-11-05T17:30:00Z");
const at = (ms: number) => new Date(START.getTime() - ms);
const H = 3_600_000;
const appt = (status: Parameters<typeof checkPatientCancellation>[0]["status"] = "confirmed") => ({ status, startsAt: START });

describe("patient cancellation rule (24 h by default)", () => {
  it("allows cancelling with plenty of time", () => {
    expect(checkPatientCancellation(appt(), 24, at(72 * H)).ok).toBe(true);
  });

  it("allows cancelling exactly 24 h 00 m 00 s before", () => {
    const r = checkPatientCancellation(appt(), 24, at(24 * H));
    expect(r.ok).toBe(true);
    expect(r.deadline.toISOString()).toBe("2026-11-04T17:30:00.000Z");
  });

  it("rejects at 23 h 59 m 59 s before", () => {
    const r = checkPatientCancellation(appt(), 24, at(24 * H - 1000));
    expect(r).toMatchObject({ ok: false, reason: "CANCEL_WINDOW_PASSED" });
  });

  it("rejects one millisecond after the limit", () => {
    expect(checkPatientCancellation(appt(), 24, at(24 * H - 1)).ok).toBe(false);
  });

  it("rejects once the appointment already started or passed", () => {
    expect(checkPatientCancellation(appt(), 24, at(0)).ok).toBe(false);
    expect(checkPatientCancellation(appt(), 24, at(-H)).ok).toBe(false);
  });

  it("reports already-cancelled appointments", () => {
    expect(checkPatientCancellation(appt("cancelled_by_patient"), 24, at(72 * H))).toMatchObject({ ok: false, reason: "ALREADY_CANCELLED" });
    expect(checkPatientCancellation(appt("cancelled_by_admin"), 24, at(72 * H))).toMatchObject({ ok: false, reason: "ALREADY_CANCELLED" });
  });

  it("does not allow cancelling attended or no-show appointments", () => {
    expect(checkPatientCancellation(appt("completed"), 24, at(72 * H))).toMatchObject({ ok: false, reason: "NOT_CANCELLABLE" });
    expect(checkPatientCancellation(appt("no_show"), 24, at(72 * H))).toMatchObject({ ok: false, reason: "NOT_CANCELLABLE" });
  });

  it("uses the configured number of hours", () => {
    expect(checkPatientCancellation(appt(), 48, at(30 * H)).ok).toBe(false);
    expect(checkPatientCancellation(appt(), 2, at(2 * H)).ok).toBe(true);
    expect(checkPatientCancellation(appt(), 0, at(1)).ok).toBe(true);
  });
});
