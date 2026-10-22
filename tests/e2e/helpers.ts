import { AR_HOLIDAYS } from "../../src/db/seed";

export const STATE = {
  staff: "tests/e2e/.auth/staff.json",
  admin: "tests/e2e/.auth/admin.json",
};
export const PASSWORD = "e2e-password-123";

const HOLIDAYS = new Set(AR_HOLIDAYS.map(([d]) => d));

/** A weekday (Mon–Fri) at least `minDaysAhead` days from today that is not a holiday. */
export function nextWorkday(minDaysAhead = 2, weekday?: number): string {
  const d = new Date();
  d.setUTCHours(15, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + minDaysAhead);
  for (let i = 0; i < 60; i++) {
    const iso = d.toISOString().slice(0, 10);
    const wd = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    if (wd <= 5 && (!weekday || wd === weekday) && !HOLIDAYS.has(iso)) return iso;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  throw new Error("no workday found");
}
