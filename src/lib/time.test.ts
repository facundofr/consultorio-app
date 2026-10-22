import { describe, expect, it } from "vitest";
import {
  addDays,
  dateRange,
  formatDateTime,
  localDateTimeToUtc,
  localDayBounds,
  localToUtc,
  minutesToTime,
  timeToMinutes,
  utcToLocal,
  weekdayOf,
} from "./time";

const TZ = "America/Argentina/Buenos_Aires";

describe("time helpers", () => {
  it("converts Buenos Aires wall clock to UTC (UTC-3)", () => {
    expect(localDateTimeToUtc("2026-11-05", "14:30", TZ).toISOString()).toBe("2026-11-05T17:30:00.000Z");
  });

  it("converts UTC to Buenos Aires wall clock, including day change", () => {
    expect(utcToLocal(new Date("2026-11-06T02:15:00Z"), TZ)).toEqual({
      date: "2026-11-05",
      time: "23:15",
      weekday: 4,
      minutes: 23 * 60 + 15,
    });
  });

  it("round-trips any instant", () => {
    const instant = new Date("2026-12-31T23:59:00Z");
    const l = utcToLocal(instant, TZ);
    expect(localDateTimeToUtc(l.date, l.time, TZ).getTime()).toBe(instant.getTime());
  });

  it("minutes past 1440 roll into the next day", () => {
    expect(localToUtc("2026-11-05", 1440 + 60, TZ).toISOString()).toBe("2026-11-06T04:00:00.000Z");
  });

  it("parses and formats times", () => {
    expect(timeToMinutes("09:05")).toBe(545);
    expect(timeToMinutes("09:05:00")).toBe(545);
    expect(timeToMinutes("24:00")).toBe(1440);
    expect(() => timeToMinutes("25:00")).toThrow();
    expect(() => timeToMinutes("9:00")).toThrow();
    expect(minutesToTime(545)).toBe("09:05");
  });

  it("does calendar arithmetic across months and years", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(dateRange("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("computes ISO weekdays", () => {
    expect(weekdayOf("2026-11-02")).toBe(1); // Monday
    expect(weekdayOf("2026-11-08")).toBe(7); // Sunday
  });

  it("gives local day bounds in UTC", () => {
    const { start, end } = localDayBounds("2026-11-05", TZ);
    expect(start.toISOString()).toBe("2026-11-05T03:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-06T03:00:00.000Z");
  });

  it("handles DST days in zones that have them", () => {
    // New York falls back on 2026-11-01: that local day lasts 25 hours.
    const { start, end } = localDayBounds("2026-11-01", "America/New_York");
    expect((end.getTime() - start.getTime()) / 3_600_000).toBe(25);
    // Spring forward 2026-03-08: 02:30 does not exist; we land on a real instant after it.
    const gap = localDateTimeToUtc("2026-03-08", "02:30", "America/New_York");
    expect(utcToLocal(gap, "America/New_York").time >= "03:00").toBe(true);
  });

  it("formats dates in Spanish (es-AR)", () => {
    expect(formatDateTime(new Date("2026-11-05T17:30:00Z"), TZ)).toBe("jueves, 5 de noviembre, 14:30 h");
  });
});
