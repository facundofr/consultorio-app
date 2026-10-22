import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { utcToLocal } from "@/lib/time";
import { SOURCE_LABELS } from "@/server/admin/appointments";
import { getDashboard } from "@/server/admin/dashboard";
import { adminContext } from "../_lib/context";

export const metadata: Metadata = { title: "Inicio" };

const pct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)} %`);

function Figure({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-l-2 border-primary/30 pl-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-3xl font-bold tabular-nums">{value}</dd>
      {detail ? <dd className="text-sm text-muted-foreground">{detail}</dd> : null}
    </div>
  );
}

export default async function DashboardPage() {
  const { db, actor, clinicId } = await adminContext();
  const d = await getDashboard(db, actor, clinicId);
  const active = d.todayAppointments.filter((a) => !a.status.startsWith("cancelled"));
  const sources = (["ai", "form", "admin"] as const).map((k) => ({ key: k, label: SOURCE_LABELS[k], n: d.bySource[k] ?? 0 }));
  const totalSrc = sources.reduce((s, x) => s + x.n, 0);
  const SRC_COLOR = { ai: "bg-primary", form: "bg-sol", admin: "bg-tinta/40" } as const;
  const noShow = d.byStatus.no_show ?? 0;
  const attended = d.byStatus.completed ?? 0;

  return (
    <>
      <PageHeader
        title="Inicio"
        description={<span className="first-letter:uppercase">{new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d.today}T12:00:00Z`))}</span>}
        actions={<Button asChild><Link href="/admin/agenda">Abrir agenda</Link></Button>}
      />

      <dl className="mb-10 grid grid-cols-2 gap-6 lg:grid-cols-4">
        <Figure label="Turnos hoy" value={String(active.length)} detail={`${d.todayAppointments.length - active.length} cancelados`} />
        <Figure label="Ocupación hoy" value={pct(d.occupancy.today.rate)} detail={`${Math.round(d.occupancy.today.bookedMinutes / 60)} h de ${Math.round(d.occupancy.today.openMinutes / 60)} h de agenda`} />
        <Figure label="Ocupación de la semana" value={pct(d.occupancy.week.rate)} />
        <Figure label="Cancelaciones, 30 días" value={String(d.cancelled30)} detail={noShow ? `${noShow} ausentes de ${noShow + attended}` : undefined} />
      </dl>

      <div className="grid gap-10 xl:grid-cols-[1fr_24rem]">
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Hoy</h2>
          {d.todayAppointments.length === 0 ? (
            <p className="text-muted-foreground">No hay turnos para hoy.</p>
          ) : (
            <ul className="divide-y rounded-lg border bg-card">
              {d.todayAppointments.map((a) => (
                <li key={a.id}>
                  <Link href={`/admin/turnos/${a.id}`} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
                    <span className="font-bold tabular-nums">{utcToLocal(a.startsAt, d.timezone).time}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{a.patientName}</span>
                      <span className="block truncate text-sm text-muted-foreground">{a.professionalName}, {a.serviceName}, {a.locationName}</span>
                    </span>
                    <StatusBadge status={a.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-10">
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Cómo reservan</h2>
            <p className="-mt-2 text-sm text-muted-foreground">Turnos creados en los últimos 30 días.</p>
            {totalSrc === 0 ? (
              <p className="text-muted-foreground">Todavía no hay reservas.</p>
            ) : (
              <>
                <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={sources.map((s) => `${s.label}: ${s.n}`).join(", ")}>
                  {sources.map((s) => (s.n ? <div key={s.key} className={SRC_COLOR[s.key]} style={{ width: `${(s.n / totalSrc) * 100}%` }} /> : null))}
                </div>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {sources.map((s) => (
                    <li key={s.key} className="flex items-center gap-2">
                      <span className={`size-2.5 rounded-full ${SRC_COLOR[s.key]}`} aria-hidden />
                      <span className="flex-1">{s.label}</span>
                      <span className="font-semibold tabular-nums">{s.n}</span>
                      <span className="w-12 text-right tabular-nums text-muted-foreground">{Math.round((s.n / totalSrc) * 100)} %</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {d.canSeeLlm ? (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">Asistente, últimos 7 días</h2>
              {d.llm.length === 0 ? (
                <p className="text-muted-foreground">Todavía no hubo conversaciones con el asistente.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="py-1 font-semibold">Proveedor</th>
                      <th className="py-1 text-right font-semibold">Llamadas</th>
                      <th className="py-1 text-right font-semibold">Errores</th>
                      <th className="py-1 text-right font-semibold">Tokens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.llm.map((r) => (
                      <tr key={r.provider} className="border-t">
                        <td className="py-1.5">{r.provider}</td>
                        <td className="py-1.5 text-right tabular-nums">{r.calls}</td>
                        <td className={`py-1.5 text-right tabular-nums ${r.errors ? "font-semibold text-destructive" : ""}`}>{r.errors}</td>
                        <td className="py-1.5 text-right tabular-nums">{r.tokens.toLocaleString("es-AR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
