/**
 * Availability engine — pure, deterministic, no I/O.
 *
 * Combines a professional's weekly grid, extra hours, blocks (vacations,
 * holidays, closures), existing appointments, the service duration and the
 * "now + lead time" margin into a list of bookable slots.
 *
 * All instants are UTC `Date`s; weekly rules are wall-clock times in `timezone`.
 */
import {
  addDays,
  localToUtc,
  timeToMinutes,
  utcToLocal,
  weekdayOf,
  type LocalDate,
  type LocalTime,
} from "@/lib/time";

export type WeeklyRule = {
  locationId: string;
  /** ISO weekday 1 (Mon) … 7 (Sun) */
  weekday: number;
  /** "HH:mm" or "HH:mm:ss" local. If end <= start the block crosses midnight. */
  startTime: string;
  endTime: string;
  validFrom?: LocalDate | null;
  validTo?: LocalDate | null;
};

export type ScheduleException = {
  kind: "block" | "extra";
  /** null/undefined = applies to every location (blocks only). */
  locationId?: string | null;
  startsAt: Date;
  endsAt: Date;
};

export type BusyInterval = { startsAt: Date; endsAt: Date };

export type EngineInput = {
  timezone: string;
  now: Date;
  /** Search window: slots whose start is in [from, to). */
  from: Date;
  to: Date;
  durationMinutes: number;
  /** Grid step for candidate start times, anchored to each opening block's start. */
  stepMinutes: number;
  /** Minimum minutes between now and a slot start. */
  minLeadMinutes: number;
  rules: WeeklyRule[];
  exceptions: ScheduleException[];
  /** Existing active appointments of the professional (any location). */
  busy: BusyInterval[];
  /** Optional location filter. */
  locationId?: string | null;
};

export type Slot = {
  startsAt: Date;
  endsAt: Date;
  locationId: string;
  localDate: LocalDate;
  localTime: LocalTime;
};

type Interval = { start: number; end: number }; // epoch ms, half-open

const MIN = 60_000;

/* ----------------------------- interval math ----------------------------- */

export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

export function subtractIntervals(base: Interval[], cut: Interval[]): Interval[] {
  const cuts = mergeIntervals(cut);
  const out: Interval[] = [];
  for (const b of base) {
    let pieces: Interval[] = [{ ...b }];
    for (const c of cuts) {
      if (c.end <= b.start || c.start >= b.end) continue;
      const next: Interval[] = [];
      for (const p of pieces) {
        if (c.end <= p.start || c.start >= p.end) {
          next.push(p);
          continue;
        }
        if (c.start > p.start) next.push({ start: p.start, end: c.start });
        if (c.end < p.end) next.push({ start: c.end, end: p.end });
      }
      pieces = next;
    }
    out.push(...pieces);
  }
  return out.filter((i) => i.end > i.start);
}

/* ------------------------------- engine ---------------------------------- */

type Opening = Interval & { locationId: string; anchor: number };

function ruleApplies(rule: WeeklyRule, date: LocalDate): boolean {
  if (rule.weekday !== weekdayOf(date)) return false;
  if (rule.validFrom && date < rule.validFrom) return false;
  if (rule.validTo && date > rule.validTo) return false;
  return true;
}

/** Concrete opening blocks produced by weekly rules + extra hours. */
function buildOpenings(input: EngineInput): Opening[] {
  const { timezone: tz, from, to } = input;
  const openings: Opening[] = [];

  // Start one day early so overnight blocks that began "yesterday" are included.
  const firstDay = addDays(utcToLocal(from, tz).date, -1);
  const lastDay = utcToLocal(new Date(to.getTime() - 1), tz).date;

  for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
    for (const rule of input.rules) {
      if (input.locationId && rule.locationId !== input.locationId) continue;
      if (!ruleApplies(rule, day)) continue;
      const s = timeToMinutes(rule.startTime);
      let e = timeToMinutes(rule.endTime);
      if (e <= s) e += 1440; // crosses midnight
      const start = localToUtc(day, s, tz).getTime();
      const end = localToUtc(day, e, tz).getTime();
      openings.push({ start, end, anchor: start, locationId: rule.locationId });
    }
  }

  for (const ex of input.exceptions) {
    if (ex.kind !== "extra" || !ex.locationId) continue;
    if (input.locationId && ex.locationId !== input.locationId) continue;
    const start = ex.startsAt.getTime();
    openings.push({ start, end: ex.endsAt.getTime(), anchor: start, locationId: ex.locationId });
  }
  return openings;
}

export type OpenWindow = { start: Date; end: Date; locationId: string };

/**
 * Opening time per location after blocks (holidays, vacations, closures),
 * ignoring appointments. Used by the agenda and occupancy stats.
 */
export function computeOpenWindows(input: Omit<EngineInput, "busy" | "durationMinutes" | "stepMinutes" | "minLeadMinutes" | "now">): OpenWindow[] {
  const openings = buildOpenings({ ...input, busy: [], durationMinutes: 1, stepMinutes: 1, minLeadMinutes: 0, now: input.from });
  const out: OpenWindow[] = [];
  const locIds = [...new Set(openings.map((o) => o.locationId))];
  const lo = input.from.getTime();
  const hi = input.to.getTime();
  for (const locationId of locIds) {
    const blocks = input.exceptions
      .filter((ex) => ex.kind === "block" && (!ex.locationId || ex.locationId === locationId))
      .map((ex) => ({ start: ex.startsAt.getTime(), end: ex.endsAt.getTime() }));
    const free = subtractIntervals(mergeIntervals(openings.filter((o) => o.locationId === locationId)), blocks);
    for (const f of free) {
      const start = Math.max(f.start, lo);
      const end = Math.min(f.end, hi);
      if (end > start) out.push({ start: new Date(start), end: new Date(end), locationId });
    }
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export function computeAvailableSlots(input: EngineInput): Slot[] {
  const { timezone: tz } = input;
  if (input.durationMinutes <= 0) throw new Error("durationMinutes must be > 0");
  if (input.stepMinutes <= 0) throw new Error("stepMinutes must be > 0");
  if (input.to.getTime() <= input.from.getTime()) return [];

  const duration = input.durationMinutes * MIN;
  const step = input.stepMinutes * MIN;
  const earliest = Math.max(input.from.getTime(), input.now.getTime() + input.minLeadMinutes * MIN);
  const latestStart = input.to.getTime(); // exclusive

  const busy: Interval[] = input.busy.map((b) => ({
    start: b.startsAt.getTime(),
    end: b.endsAt.getTime(),
  }));

  const openings = buildOpenings(input);
  const byLocation = new Map<string, Opening[]>();
  for (const o of openings) {
    const list = byLocation.get(o.locationId) ?? [];
    list.push(o);
    byLocation.set(o.locationId, list);
  }

  const slots: Slot[] = [];
  const seen = new Set<string>();

  for (const [locationId, list] of byLocation) {
    const blocks: Interval[] = input.exceptions
      .filter((ex) => ex.kind === "block" && (!ex.locationId || ex.locationId === locationId))
      .map((ex) => ({ start: ex.startsAt.getTime(), end: ex.endsAt.getTime() }));

    // Free time at this location = openings − blocks − busy (busy at ANY location).
    const free = mergeIntervals(subtractIntervals(mergeIntervals(list), [...blocks, ...busy]));

    // Candidate starts follow each opening's own grid (anchored at its start).
    for (const o of list) {
      const firstK = Math.max(0, Math.ceil((earliest - o.anchor) / step));
      for (let t = o.anchor + firstK * step; t + duration <= o.end; t += step) {
        if (t < earliest || t >= latestStart) {
          if (t >= latestStart) break;
          continue;
        }
        const end = t + duration;
        const fits = free.some((f) => f.start <= t && end <= f.end);
        if (!fits) continue;
        const key = `${locationId}|${t}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const local = utcToLocal(new Date(t), tz);
        slots.push({
          startsAt: new Date(t),
          endsAt: new Date(end),
          locationId,
          localDate: local.date,
          localTime: local.time,
        });
      }
    }
  }

  slots.sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.locationId.localeCompare(b.locationId),
  );
  return slots;
}
