import { describe, expect, it } from "vitest";
import { computeAvailableSlots, mergeIntervals, subtractIntervals, type EngineInput } from "./engine";

const TZ = "America/Argentina/Buenos_Aires"; // UTC-3, no DST
const LOC_A = "loc-a";
const LOC_B = "loc-b";

/** Local Buenos Aires wall-clock → UTC Date. */
const ar = (date: string, time: string) => new Date(`${date}T${time}:00-03:00`);

// 2026-11-02 is a Monday.
const MON = "2026-11-02";
const TUE = "2026-11-03";

function base(overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    timezone: TZ,
    now: ar("2026-10-30", "08:00"),
    from: ar(MON, "00:00"),
    to: ar(TUE, "00:00"),
    durationMinutes: 30,
    stepMinutes: 30,
    minLeadMinutes: 0,
    rules: [{ locationId: LOC_A, weekday: 1, startTime: "09:00", endTime: "12:00" }],
    exceptions: [],
    busy: [],
    ...overrides,
  };
}

const times = (input: EngineInput) => computeAvailableSlots(input).map((s) => s.localTime);
const stamps = (input: EngineInput) =>
  computeAvailableSlots(input).map((s) => `${s.localDate} ${s.localTime}`);

describe("interval helpers", () => {
  it("merges overlapping and touching intervals", () => {
    expect(
      mergeIntervals([
        { start: 5, end: 7 },
        { start: 0, end: 2 },
        { start: 2, end: 3 },
        { start: 6, end: 9 },
      ]),
    ).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 9 },
    ]);
  });

  it("subtracts holes", () => {
    expect(subtractIntervals([{ start: 0, end: 10 }], [{ start: 2, end: 4 }, { start: 8, end: 12 }])).toEqual([
      { start: 0, end: 2 },
      { start: 4, end: 8 },
    ]);
  });
});

describe("computeAvailableSlots — weekly grid", () => {
  it("builds slots from the weekly grid, in local time", () => {
    expect(times(base())).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00", "11:30"]);
  });

  it("returns UTC instants that match the local wall clock", () => {
    const [first] = computeAvailableSlots(base());
    expect(first.startsAt.toISOString()).toBe("2026-11-02T12:00:00.000Z");
    expect(first.endsAt.toISOString()).toBe("2026-11-02T12:30:00.000Z");
    expect(first.localDate).toBe(MON);
    expect(first.locationId).toBe(LOC_A);
  });

  it("uses a finer step than the duration (overlapping candidates)", () => {
    expect(times(base({ stepMinutes: 15, durationMinutes: 30 }))).toEqual([
      "09:00", "09:15", "09:30", "09:45", "10:00", "10:15", "10:30", "10:45", "11:00", "11:15", "11:30",
    ]);
  });

  it("ignores rules for other weekdays", () => {
    expect(times(base({ rules: [{ locationId: LOC_A, weekday: 2, startTime: "09:00", endTime: "12:00" }] }))).toEqual(
      [],
    );
  });

  it("respects validFrom / validTo on rules", () => {
    const rule = { locationId: LOC_A, weekday: 1, startTime: "09:00", endTime: "10:00" };
    expect(times(base({ rules: [{ ...rule, validFrom: TUE }] }))).toEqual([]);
    expect(times(base({ rules: [{ ...rule, validTo: "2026-11-01" }] }))).toEqual([]);
    expect(times(base({ rules: [{ ...rule, validFrom: MON, validTo: MON }] }))).toEqual(["09:00", "09:30"]);
  });

  it("supports split shifts on the same day", () => {
    const rules = [
      { locationId: LOC_A, weekday: 1, startTime: "09:00", endTime: "10:00" },
      { locationId: LOC_A, weekday: 1, startTime: "15:00", endTime: "16:00" },
    ];
    expect(times(base({ rules }))).toEqual(["09:00", "09:30", "15:00", "15:30"]);
  });

  it("filters by location and keeps each slot's location", () => {
    const rules = [
      { locationId: LOC_A, weekday: 1, startTime: "09:00", endTime: "10:00" },
      { locationId: LOC_B, weekday: 1, startTime: "14:00", endTime: "15:00" },
    ];
    expect(computeAvailableSlots(base({ rules })).map((s) => `${s.locationId} ${s.localTime}`)).toEqual([
      "loc-a 09:00",
      "loc-a 09:30",
      "loc-b 14:00",
      "loc-b 14:30",
    ]);
    expect(times(base({ rules, locationId: LOC_B }))).toEqual(["14:00", "14:30"]);
  });
});

describe("computeAvailableSlots — day change", () => {
  it("handles a search window spanning two days", () => {
    const rules = [
      { locationId: LOC_A, weekday: 1, startTime: "17:00", endTime: "18:00" },
      { locationId: LOC_A, weekday: 2, startTime: "08:00", endTime: "09:00" },
    ];
    expect(stamps(base({ rules, from: ar(MON, "17:30"), to: ar(TUE, "08:31") }))).toEqual([
      "2026-11-02 17:30",
      "2026-11-03 08:00",
      "2026-11-03 08:30",
    ]);
  });

  it("supports blocks that cross midnight, dating slots on the right local day", () => {
    const rules = [{ locationId: LOC_A, weekday: 1, startTime: "22:00", endTime: "01:00" }];
    expect(stamps(base({ rules, to: ar("2026-11-04", "00:00"), durationMinutes: 60, stepMinutes: 60 }))).toEqual([
      "2026-11-02 22:00",
      "2026-11-02 23:00",
      "2026-11-03 00:00",
    ]);
  });

  it("includes an overnight block that started before the search window", () => {
    const rules = [{ locationId: LOC_A, weekday: 1, startTime: "22:00", endTime: "02:00" }];
    expect(stamps(base({ rules, from: ar(TUE, "00:00"), to: ar(TUE, "12:00"), durationMinutes: 60, stepMinutes: 60 }))).toEqual([
      "2026-11-03 00:00",
      "2026-11-03 01:00",
    ]);
  });

  it("a slot never runs past the end of its opening, even across midnight", () => {
    const rules = [{ locationId: LOC_A, weekday: 1, startTime: "23:00", endTime: "00:00" }];
    expect(times(base({ rules, to: ar("2026-11-04", "00:00"), durationMinutes: 45, stepMinutes: 15 }))).toEqual([
      "23:00",
      "23:15",
    ]);
  });
});

describe("computeAvailableSlots — exceptions", () => {
  it("leaves a hole for a block inside the grid", () => {
    const exceptions = [{ kind: "block" as const, locationId: null, startsAt: ar(MON, "10:00"), endsAt: ar(MON, "11:00") }];
    expect(times(base({ exceptions }))).toEqual(["09:00", "09:30", "11:00", "11:30"]);
  });

  it("a block cutting a slot in half removes that slot", () => {
    const exceptions = [{ kind: "block" as const, startsAt: ar(MON, "09:45"), endsAt: ar(MON, "10:15") }];
    expect(times(base({ exceptions }))).toEqual(["09:00", "10:30", "11:00", "11:30"]);
  });

  it("a full-day holiday removes the whole day", () => {
    const exceptions = [{ kind: "block" as const, startsAt: ar(MON, "00:00"), endsAt: ar(TUE, "00:00") }];
    expect(times(base({ exceptions }))).toEqual([]);
  });

  it("a location-specific block only affects that location", () => {
    const rules = [
      { locationId: LOC_A, weekday: 1, startTime: "09:00", endTime: "10:00" },
      { locationId: LOC_B, weekday: 1, startTime: "14:00", endTime: "15:00" },
    ];
    const exceptions = [{ kind: "block" as const, locationId: LOC_B, startsAt: ar(MON, "00:00"), endsAt: ar(TUE, "00:00") }];
    expect(computeAvailableSlots(base({ rules, exceptions })).map((s) => s.locationId)).toEqual([LOC_A, LOC_A]);
  });

  it("extra hours add availability on a day without a rule", () => {
    const exceptions = [
      { kind: "extra" as const, locationId: LOC_A, startsAt: ar("2026-11-07", "10:00"), endsAt: ar("2026-11-07", "11:00") },
    ];
    expect(stamps(base({ exceptions, to: ar("2026-11-08", "00:00") }))).toEqual(
      [
        "2026-11-02 09:00", "2026-11-02 09:30", "2026-11-02 10:00", "2026-11-02 10:30", "2026-11-02 11:00", "2026-11-02 11:30",
        "2026-11-07 10:00", "2026-11-07 10:30",
      ],
    );
  });

  it("extra hours that overlap the grid do not duplicate slots", () => {
    const exceptions = [{ kind: "extra" as const, locationId: LOC_A, startsAt: ar(MON, "11:00"), endsAt: ar(MON, "13:00") }];
    expect(times(base({ exceptions }))).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30"]);
  });

  it("extra hours without a location are ignored (invalid data)", () => {
    const exceptions = [{ kind: "extra" as const, locationId: null, startsAt: ar(MON, "13:00"), endsAt: ar(MON, "14:00") }];
    expect(times(base({ exceptions }))).toHaveLength(6);
  });
});

describe("computeAvailableSlots — existing appointments", () => {
  it("back-to-back appointments: the next slot starts right when they end", () => {
    const busy = [
      { startsAt: ar(MON, "09:00"), endsAt: ar(MON, "09:30") },
      { startsAt: ar(MON, "09:30"), endsAt: ar(MON, "10:00") },
    ];
    expect(times(base({ busy }))).toEqual(["10:00", "10:30", "11:00", "11:30"]);
  });

  it("a slot may end exactly when the next appointment starts", () => {
    const busy = [{ startsAt: ar(MON, "09:30"), endsAt: ar(MON, "10:00") }];
    expect(times(base({ busy }))).toEqual(["09:00", "10:00", "10:30", "11:00", "11:30"]);
  });

  it("an appointment at another location still blocks the professional", () => {
    const rules = [
      { locationId: LOC_A, weekday: 1, startTime: "09:00", endTime: "10:00" },
      { locationId: LOC_B, weekday: 1, startTime: "09:00", endTime: "10:00" },
    ];
    const busy = [{ startsAt: ar(MON, "09:00"), endsAt: ar(MON, "09:30") }];
    expect(computeAvailableSlots(base({ rules, busy })).map((s) => `${s.locationId} ${s.localTime}`)).toEqual([
      "loc-a 09:30",
      "loc-b 09:30",
    ]);
  });

  it("an off-grid appointment blocks every overlapping candidate", () => {
    const busy = [{ startsAt: ar(MON, "09:20"), endsAt: ar(MON, "09:40") }];
    expect(times(base({ busy, stepMinutes: 15 }))).toEqual([
      "09:45", "10:00", "10:15", "10:30", "10:45", "11:00", "11:15", "11:30",
    ]);
  });
});

describe("computeAvailableSlots — service duration", () => {
  it("a service longer than the free gap is not offered there", () => {
    const busy = [
      { startsAt: ar(MON, "09:00"), endsAt: ar(MON, "10:00") },
      { startsAt: ar(MON, "10:30"), endsAt: ar(MON, "12:00") },
    ];
    expect(times(base({ busy, durationMinutes: 45, stepMinutes: 15 }))).toEqual([]);
    expect(times(base({ busy, durationMinutes: 30, stepMinutes: 15 }))).toEqual(["10:00"]);
  });

  it("a service longer than the whole opening yields nothing", () => {
    expect(times(base({ durationMinutes: 240 }))).toEqual([]);
  });

  it("a service exactly as long as the opening yields one slot", () => {
    expect(times(base({ durationMinutes: 180, stepMinutes: 15 }))).toEqual(["09:00"]);
  });
});

describe("computeAvailableSlots — now and lead time", () => {
  it("a slot starting exactly now is offered when there is no lead time", () => {
    expect(times(base({ now: ar(MON, "09:00"), minLeadMinutes: 0 }))[0]).toBe("09:00");
  });

  it("a slot that started a moment ago is not offered", () => {
    expect(times(base({ now: new Date(ar(MON, "09:00").getTime() + 1), minLeadMinutes: 0 }))[0]).toBe("09:30");
  });

  it("applies the lead-time margin and snaps to the grid", () => {
    expect(times(base({ now: ar(MON, "09:05"), minLeadMinutes: 60 }))).toEqual(["10:30", "11:00", "11:30"]);
  });

  it("past days are never offered", () => {
    expect(times(base({ now: ar(TUE, "08:00") }))).toEqual([]);
  });
});

describe("computeAvailableSlots — empty and invalid ranges", () => {
  it("empty range returns nothing", () => {
    expect(times(base({ to: ar(MON, "00:00") }))).toEqual([]);
    expect(times(base({ from: ar(TUE, "00:00"), to: ar(MON, "00:00") }))).toEqual([]);
  });

  it("no rules returns nothing", () => {
    expect(times(base({ rules: [] }))).toEqual([]);
  });

  it("only slots starting inside [from, to) are returned", () => {
    expect(times(base({ from: ar(MON, "10:00"), to: ar(MON, "11:00") }))).toEqual(["10:00", "10:30"]);
  });

  it("rejects non-positive durations or steps", () => {
    expect(() => computeAvailableSlots(base({ durationMinutes: 0 }))).toThrow();
    expect(() => computeAvailableSlots(base({ stepMinutes: 0 }))).toThrow();
  });
});

describe("computeAvailableSlots — other time zones", () => {
  it("keeps wall-clock hours across a DST change (America/New_York, 2026-11-01)", () => {
    const tz = "America/New_York";
    const rules = [
      { locationId: LOC_A, weekday: 6, startTime: "09:00", endTime: "10:00" }, // Sat 31 Oct, EDT
      { locationId: LOC_A, weekday: 1, startTime: "09:00", endTime: "10:00" }, // Mon 2 Nov, EST
    ];
    const slots = computeAvailableSlots(
      base({
        timezone: tz,
        rules,
        now: new Date("2026-10-01T00:00:00Z"),
        from: new Date("2026-10-31T00:00:00Z"),
        to: new Date("2026-11-03T00:00:00Z"),
        durationMinutes: 60,
        stepMinutes: 60,
      }),
    );
    expect(slots.map((s) => s.startsAt.toISOString())).toEqual([
      "2026-10-31T13:00:00.000Z",
      "2026-11-02T14:00:00.000Z",
    ]);
    expect(slots.map((s) => s.localTime)).toEqual(["09:00", "09:00"]);
  });
});
