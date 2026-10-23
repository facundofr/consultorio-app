"use client";

import { CalendarOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ComponentProps } from "react";
import type { DayButton } from "react-day-picker";
import { agendaMonthAction } from "@/app/admin/_actions/agenda";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import type { AgendaMode, AgendaMonth, AgendaMonthDay } from "@/server/admin/agenda";

const pad = (n: number) => String(n).padStart(2, "0");
/** Calendar dates are wall-clock days: build them at local midnight. */
const toDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toMonth = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const longDay = (d: Date) => new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long" }).format(d);

const occupancy = (s: AgendaMonthDay) => (s.openMinutes > 0 ? Math.min(100, Math.round((s.bookedMinutes / s.openMinutes) * 100)) : 0);

function describe(date: Date, s: AgendaMonthDay | undefined) {
  if (!s) return longDay(date);
  if (s.closedReason) return `${longDay(date)}: ${s.closedReason}`;
  const parts = [`${s.appointments} turno${s.appointments === 1 ? "" : "s"}`];
  if (s.openMinutes > 0) parts.push(`${occupancy(s)} % ocupado`);
  else if (!s.appointments) parts[0] = "sin atención";
  if (s.cancelled) parts.push(`${s.cancelled} cancelado${s.cancelled === 1 ? "" : "s"}`);
  return `${longDay(date)}: ${parts.join(", ")}`;
}

/** Link builder shared by both calendars: keeps mode, subject and patient. */
function useAgendaHref(baseQuery: string) {
  return (patch: Record<string, string>) => {
    const q = new URLSearchParams(baseQuery);
    for (const [k, v] of Object.entries(patch)) q.set(k, v);
    q.delete("nuevo");
    return `/admin/agenda?${q.toString()}`;
  };
}

/* ------------------------------- Month view ------------------------------- */

function MonthDayButton({ day, modifiers, summary, today, className, ...props }: ComponentProps<typeof DayButton> & { summary?: AgendaMonthDay; today: string }) {
  const iso = toIso(day.date);
  const isToday = iso === today;
  const occ = summary ? occupancy(summary) : 0;
  return (
    <button
      type="button"
      {...props}
      aria-label={describe(day.date, modifiers.outside ? undefined : summary)}
      className={cn(
        "flex size-full flex-col items-stretch gap-1 p-1.5 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:p-2",
        modifiers.outside && "opacity-45",
        summary?.closedReason && !modifiers.outside && "bg-muted/60",
        className,
      )}
    >
      <span
        className={cn(
          "flex size-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
          isToday && "bg-sol text-sol-foreground",
        )}
      >
        {day.date.getDate()}
      </span>
      {summary && !modifiers.outside ? (
        summary.closedReason ? (
          <span className="flex items-start gap-1 text-[0.7rem] leading-tight text-muted-foreground">
            <CalendarOff className="mt-px hidden size-3 shrink-0 sm:block" aria-hidden />
            <span className="line-clamp-2 break-words">{summary.closedReason.replace(/^Feriado: /, "")}</span>
          </span>
        ) : summary.appointments > 0 || summary.openMinutes > 0 ? (
          <span className="mt-auto flex flex-col gap-1">
            {summary.appointments > 0 ? (
              <span className="text-xs font-bold leading-none text-foreground sm:text-sm">
                {summary.appointments}
                <span className="hidden font-semibold sm:inline"> turno{summary.appointments === 1 ? "" : "s"}</span>
              </span>
            ) : (
              <span className="hidden text-xs text-muted-foreground sm:inline">Libre</span>
            )}
            {summary.openMinutes > 0 ? (
              <span className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                <span
                  className={cn("block h-full rounded-full", occ >= 85 ? "bg-destructive" : occ >= 50 ? "bg-sol" : "bg-primary")}
                  style={{ width: `${Math.max(occ, summary.appointments ? 6 : 0)}%` }}
                />
              </span>
            ) : null}
            {summary.cancelled > 0 ? (
              <span className="hidden text-[0.7rem] leading-none text-muted-foreground lg:inline">
                {summary.cancelled} cancelado{summary.cancelled === 1 ? "" : "s"}
              </span>
            ) : null}
          </span>
        ) : null
      ) : null}
    </button>
  );
}

export function AgendaMonthView({ data, today, baseQuery }: { data: AgendaMonth; today: string; baseQuery: string }) {
  const router = useRouter();
  const href = useAgendaHref(baseQuery);
  const month = toDate(`${data.month}-01`);
  const components = useMemo(
    () => ({
      DayButton: (p: ComponentProps<typeof DayButton>) => <MonthDayButton {...p} summary={data.days[toIso(p.day.date)]} today={today} />,
    }),
    [data, today],
  );
  const totals = Object.values(data.days).reduce(
    (t, d) => ({ appts: t.appts + d.appointments, open: t.open + d.openMinutes, booked: t.booked + d.bookedMinutes }),
    { appts: 0, open: 0, booked: 0 },
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Calendar
          size="lg"
          month={month}
          onMonthChange={(m) => router.push(href({ vista: "mes", fecha: `${toMonth(m)}-01` }))}
          onDayClick={(d) => router.push(href({ vista: "dia", fecha: toIso(d) }))}
          components={components}
          // The page header already shows the month with its own arrows.
          hideNavigation
          classNames={{ month_caption: "sr-only" }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
        <span>
          <strong className="text-foreground">{totals.appts}</strong> turnos en el mes
          {totals.open ? <> · <strong className="text-foreground">{Math.round((totals.booked / totals.open) * 100)} %</strong> de ocupación</> : null}
        </span>
        <span className="flex items-center gap-3" aria-label="Referencia de ocupación">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-primary" aria-hidden />Menos de 50 %</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-sol" aria-hidden />50–84 %</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-destructive" aria-hidden />85 % o más</span>
        </span>
      </div>
    </div>
  );
}

/* ------------------------------ Mini calendar ----------------------------- */

function MiniDayButton({ day, modifiers, summary, className, ...props }: ComponentProps<typeof DayButton> & { summary?: AgendaMonthDay }) {
  return (
    <button
      type="button"
      {...props}
      aria-label={describe(day.date, modifiers.outside ? undefined : summary)}
      data-selected={modifiers.selected || undefined}
      className={cn(
        "relative flex size-full flex-col items-center justify-center rounded-md text-sm tabular-nums outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
        "data-[selected]:bg-primary data-[selected]:font-bold data-[selected]:text-primary-foreground data-[selected]:hover:bg-primary",
        summary?.closedReason && !modifiers.outside && "text-muted-foreground line-through decoration-muted-foreground/50",
        className,
      )}
    >
      {day.date.getDate()}
      {summary && summary.appointments > 0 && !modifiers.outside ? (
        <span className="absolute bottom-1 size-1 rounded-full bg-current opacity-70 [button:not([data-selected])_&]:bg-primary [button:not([data-selected])_&]:opacity-100" aria-hidden />
      ) : null}
    </button>
  );
}

export function AgendaMiniCalendar({
  initial,
  date,
  view,
  mode,
  subjectId,
  baseQuery,
}: {
  initial: AgendaMonth;
  date: string;
  view: "dia" | "semana";
  mode: AgendaMode;
  subjectId: string | null;
  baseQuery: string;
}) {
  const router = useRouter();
  const href = useAgendaHref(baseQuery);
  const [data, setData] = useState(initial);
  const [month, setMonth] = useState(() => toDate(`${initial.month}-01`));
  const [loading, startTransition] = useTransition();
  const components = useMemo(
    () => ({ DayButton: (p: ComponentProps<typeof DayButton>) => <MiniDayButton {...p} summary={data.days[toIso(p.day.date)]} /> }),
    [data],
  );

  return (
    <div className={cn("rounded-xl border bg-card shadow-sm transition-opacity", loading && "opacity-70")} aria-busy={loading}>
      <Calendar
        mode="single"
        required
        selected={toDate(date)}
        month={month}
        onMonthChange={(m) => {
          setMonth(m);
          startTransition(async () => {
            const next = await agendaMonthAction({ mode, subjectId, month: toMonth(m) });
            if (next) setData(next);
          });
        }}
        onSelect={(d) => d && router.push(href({ vista: view, fecha: toIso(d) }))}
        components={components}
        className="rounded-xl"
      />
      <p className="flex items-center gap-1.5 border-t px-3 py-2 text-xs text-muted-foreground">
        <span className="size-1.5 rounded-full bg-primary" aria-hidden /> Días con turnos
      </p>
    </div>
  );
}
