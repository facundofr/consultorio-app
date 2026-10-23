import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function StepHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-1">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      {children ? <p className="max-w-prose text-muted-foreground">{children}</p> : null}
    </div>
  );
}

/** One tappable row per option, in a single bordered list. */
export function OptionList({ options }: { options: { href: string; title: string; detail?: ReactNode; emphasis?: boolean }[] }) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {options.map((o) => (
        <li key={o.href}>
          <Link
            href={o.href}
            className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-secondary focus-visible:bg-secondary"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={o.emphasis ? "font-bold text-primary" : "font-semibold"}>{o.title}</span>
              {o.detail ? <span className="text-sm text-muted-foreground">{o.detail}</span> : null}
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** What has been chosen so far, each with a link to change it. */
export function ChoicesSummary({ items }: { items: { label: string; value: string; changeHref?: string }[] }) {
  if (!items.length) return null;
  return (
    <dl className="mb-8 grid grid-cols-[auto_1fr_auto] items-baseline gap-x-4 gap-y-1.5 rounded-xl bg-secondary/60 px-4 py-3 text-sm">
      {items.map((i) => (
        <div key={i.label} className="contents">
          <dt className="text-muted-foreground">{i.label}</dt>
          <dd className="font-semibold">{i.value}</dd>
          <dd>
            {i.changeHref ? (
              <Link href={i.changeHref} className="text-primary underline underline-offset-4" aria-label={`Cambiar ${i.label.toLowerCase()}`}>
                Cambiar
              </Link>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

const WEEKDAYS = [
  ["L", "lunes"],
  ["M", "martes"],
  ["M", "miércoles"],
  ["J", "jueves"],
  ["V", "viernes"],
  ["S", "sábado"],
  ["D", "domingo"],
] as const;

function monthsBetween(first: string, last: string) {
  const out: { y: number; m: number }[] = [];
  let [y, m] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  while (y < ly || (y === ly && m <= lm)) {
    out.push({ y, m });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Month grids; days with availability are links. */
export function DayCalendar({ today, lastDay, available, hrefFor }: { today: string; lastDay: string; available: string[]; hrefFor: (date: string) => string }) {
  const set = new Set(available);
  return (
    <div className="grid gap-8 sm:grid-cols-2">
      {monthsBetween(today, lastDay).map(({ y, m }) => {
        const first = new Date(Date.UTC(y, m - 1, 1));
        const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const offset = (first.getUTCDay() + 6) % 7; // Monday first
        const cells: (string | null)[] = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`)];
        while (cells.length % 7) cells.push(null);
        const monthName = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
        if (!cells.some((c) => c && c >= today && c <= lastDay)) return null;
        return (
          <table key={`${y}-${m}`} className="w-full table-fixed border-separate border-spacing-1 text-center">
            <caption className="mb-2 text-left font-semibold first-letter:uppercase">{monthName}</caption>
            <thead>
              <tr>
                {WEEKDAYS.map(([short, long], i) => (
                  <th key={i} scope="col" className="pb-1 text-xs font-semibold text-muted-foreground">
                    <abbr title={long} className="no-underline">{short}</abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: cells.length / 7 }, (_, w) => (
                <tr key={w}>
                  {cells.slice(w * 7, w * 7 + 7).map((c, i) => {
                    if (!c) return <td key={i} />;
                    const n = Number(c.slice(8));
                    const label = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${c}T12:00:00Z`));
                    return (
                      <td key={i}>
                        {set.has(c) ? (
                          <Link
                            href={hrefFor(c)}
                            aria-label={`${label}, hay turnos`}
                            className="flex aspect-square items-center justify-center rounded-lg border border-primary/40 bg-card font-bold tabular-nums text-primary hover:border-tinta hover:bg-sol hover:text-sol-foreground"
                          >
                            {n}
                          </Link>
                        ) : (
                          <span className="flex aspect-square items-center justify-center rounded-lg tabular-nums text-muted-foreground/50" aria-label={`${label}, sin turnos`}>
                            {n}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        );
      })}
    </div>
  );
}

/** Time "tickets": the memorable element of the booking flow. */
export function SlotTickets({ groups }: { groups: { label: string; slots: { href: string; time: string; detail?: string }[] }[] }) {
  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) =>
        g.slots.length ? (
          <section key={g.label} aria-label={g.label} className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">{g.label}</h2>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2">
              {g.slots.map((s) => (
                <li key={s.href}>
                  <Link
                    href={s.href}
                    className="group flex h-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-primary/30 bg-card px-2 py-3 text-center hover:border-solid hover:border-tinta hover:bg-sol hover:text-sol-foreground"
                  >
                    <span className="text-xl font-bold tabular-nums">{s.time}</span>
                    {s.detail ? <span className="text-xs leading-tight text-muted-foreground group-hover:text-sol-foreground/80">{s.detail}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </div>
  );
}
