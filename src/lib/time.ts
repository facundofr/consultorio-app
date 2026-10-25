import { TZDate } from "@date-fns/tz";

/**
 * Timezone helpers. Everything is stored in UTC; wall-clock values
 * ("2026-11-05", "14:30") are always interpreted in an explicit IANA zone.
 */

export const DEFAULT_TZ = "America/Argentina/Buenos_Aires";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

export type LocalDate = string; // YYYY-MM-DD
export type LocalTime = string; // HH:mm

function parseDate(d: LocalDate) {
  const m = DATE_RE.exec(d);
  if (!m) throw new Error(`Invalid local date: ${d}`);
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
}

/** "HH:mm[:ss]" → minutes since midnight. "24:00" is allowed (= 1440). */
export function timeToMinutes(t: string): number {
  const m = TIME_RE.exec(t);
  if (!m) throw new Error(`Invalid local time: ${t}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min !== 0)) throw new Error(`Invalid local time: ${t}`);
  return h * 60 + min;
}

export function minutesToTime(mins: number): LocalTime {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Wall-clock date + minutes-since-midnight in `tz` → UTC instant.
 * Minutes may exceed 1440 (rolls into the next day).
 */
export function localToUtc(date: LocalDate, minutes: number, tz: string): Date {
  const { y, mo, d } = parseDate(date);
  const z = new TZDate(y, mo - 1, d, 0, 0, 0, 0, tz);
  // Build from components to respect DST transitions on the target day.
  const dayOffset = Math.floor(minutes / 1440);
  const rem = minutes - dayOffset * 1440;
  const target = new TZDate(
    z.getFullYear(),
    z.getMonth(),
    z.getDate() + dayOffset,
    Math.floor(rem / 60),
    rem % 60,
    0,
    0,
    tz,
  );
  return new Date(target.getTime());
}

export function localDateTimeToUtc(date: LocalDate, time: LocalTime, tz: string): Date {
  return localToUtc(date, timeToMinutes(time), tz);
}

export type LocalParts = {
  date: LocalDate;
  time: LocalTime;
  /** ISO weekday: 1 = Monday … 7 = Sunday */
  weekday: number;
  minutes: number;
};

export function utcToLocal(instant: Date, tz: string): LocalParts {
  const z = new TZDate(instant.getTime(), tz);
  const y = z.getFullYear();
  const mo = z.getMonth() + 1;
  const d = z.getDate();
  const h = z.getHours();
  const mi = z.getMinutes();
  const js = z.getDay(); // 0 = Sunday
  return {
    date: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    time: `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`,
    weekday: js === 0 ? 7 : js,
    minutes: h * 60 + mi,
  };
}

/** Calendar arithmetic on a local date string (timezone independent). */
export function addDays(date: LocalDate, days: number): LocalDate {
  const { y, mo, d } = parseDate(date);
  const t = new Date(Date.UTC(y, mo - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a local date. */
export function weekdayOf(date: LocalDate): number {
  const { y, mo, d } = parseDate(date);
  const js = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

/** Inclusive list of local dates between a and b (a <= b). */
export function dateRange(a: LocalDate, b: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  for (let cur = a; cur <= b; cur = addDays(cur, 1)) out.push(cur);
  return out;
}

/** Start (00:00 local) and end (next day 00:00 local) of a local day, in UTC. */
export function localDayBounds(date: LocalDate, tz: string): { start: Date; end: Date } {
  return { start: localToUtc(date, 0, tz), end: localToUtc(addDays(date, 1), 0, tz) };
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string, opts: Intl.DateTimeFormatOptions) {
  const key = tz + JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("es-AR", { timeZone: tz, ...opts });
    fmtCache.set(key, f);
  }
  return f;
}

/** "jueves 5 de noviembre" */
export function formatLongDate(instant: Date, tz: string): string {
  return formatter(tz, { weekday: "long", day: "numeric", month: "long" }).format(instant);
}

/** "14:30" */
export function formatTime(instant: Date, tz: string): string {
  return utcToLocal(instant, tz).time;
}

/** "jueves 5 de noviembre, 14:30 h" */
export function formatDateTime(instant: Date, tz: string): string {
  return `${formatLongDate(instant, tz)}, ${formatTime(instant, tz)} h`;
}

/** "jue 5/11, 14:30 h" — compact, for email subjects. */
export function formatShortDateTime(instant: Date, tz: string): string {
  const wd = formatter(tz, { weekday: "short" }).format(instant).replace(".", "");
  const l = utcToLocal(instant, tz);
  const [, m, d] = l.date.split("-");
  return `${wd} ${Number(d)}/${Number(m)}, ${l.time} h`;
}
