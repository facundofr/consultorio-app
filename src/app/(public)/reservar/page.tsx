import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChoicesSummary, DayCalendar, OptionList, SlotTickets, StepHeading } from "@/components/public/wizard-ui";
import { getDb } from "@/db/client";
import { serverNow } from "@/lib/clock";
import { utcToLocal } from "@/lib/time";
import { formatMoney } from "@/server/admin/common";
import {
  findSlots,
  getClinicInfo,
  listClinicsPublic,
  listLocationsPublic,
  listProfessionalsPublic,
  listServicesPublic,
  listSpecialtiesPublic,
} from "@/server/booking/public";
import { BookingForm } from "./booking-form";

export const metadata: Metadata = { title: "Reservar turno" };
export const dynamic = "force-dynamic";

/** Wizard state lives in the URL, in this order. */
const ORDER = ["clinica", "sede", "especialidad", "profesional", "consulta", "dia", "hora", "en", "con"] as const;
type Key = (typeof ORDER)[number];
type State = Partial<Record<Key, string>>;

const ANY_LOCATION = "todas";
const ANY_PROFESSIONAL = "cualquiera";

function href(state: State, patch: State = {}) {
  const merged: State = { ...state, ...patch };
  const sp = new URLSearchParams();
  for (const k of ORDER) if (merged[k]) sp.set(k, merged[k]!);
  const qs = sp.toString();
  return qs ? `/reservar?${qs}` : "/reservar";
}

/** URL keeping only the keys before `key` (used by "Cambiar" links and invalid params). */
function upTo(state: State, key: Key) {
  const out: State = {};
  for (const k of ORDER) {
    if (k === key) break;
    if (state[k]) out[k] = state[k];
  }
  return href(out);
}

const longDate = (d: string) =>
  new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

export default async function BookingPage({ searchParams }: PageProps<"/reservar">) {
  const db = getDb();
  const now = serverNow();
  const sp = await searchParams;
  const st: State = {};
  for (const k of ORDER) {
    const v = sp[k];
    if (typeof v === "string" && v.length < 100) st[k] = v;
  }
  const summary: { label: string; value: string; changeHref?: string }[] = [];

  /* 1. Clinic */
  const clinics = await listClinicsPublic(db);
  if (clinics.length === 0) return <StepHeading title="Todavía no hay clínicas disponibles" />;
  if (!st.clinica) {
    if (clinics.length === 1) redirect(href({ clinica: clinics[0].slug }));
    return (
      <>
        <StepHeading title="¿En qué clínica querés atenderte?" />
        <OptionList options={clinics.map((c) => ({ href: href({ clinica: c.slug }), title: c.name }))} />
      </>
    );
  }
  const clinic = clinics.find((c) => c.slug === st.clinica);
  if (!clinic) redirect(upTo(st, "clinica"));
  if (clinics.length > 1) summary.push({ label: "Clínica", value: clinic.name, changeHref: upTo(st, "clinica") });

  /* 2. Location */
  const locs = await listLocationsPublic(db, clinic.id);
  if (!st.sede) {
    if (locs.length <= 1) redirect(href(st, { sede: locs[0]?.id ?? ANY_LOCATION }));
    return (
      <>
        <ChoicesSummary items={summary} />
        <StepHeading title="¿En qué sede?" />
        <OptionList
          options={[
            ...locs.map((l) => ({ href: href(st, { sede: l.id }), title: l.name, detail: `${l.address}${l.city && !l.address.includes(l.city) ? `, ${l.city}` : ""}` })),
            { href: href(st, { sede: ANY_LOCATION }), title: "Me da igual la sede", detail: "Te mostramos los horarios de todas", emphasis: true },
          ]}
        />
      </>
    );
  }
  const location = st.sede === ANY_LOCATION ? null : locs.find((l) => l.id === st.sede);
  if (st.sede !== ANY_LOCATION && !location) redirect(upTo(st, "sede"));
  const locationId = location?.id ?? null;
  if (locs.length > 1) summary.push({ label: "Sede", value: location?.name ?? "Cualquiera", changeHref: upTo(st, "sede") });

  /* 3. Specialty */
  const specs = await listSpecialtiesPublic(db, clinic.id, locationId);
  if (!st.especialidad) {
    if (specs.length === 1) redirect(href(st, { especialidad: specs[0].id }));
    return (
      <>
        <ChoicesSummary items={summary} />
        <StepHeading title="¿Qué especialidad necesitás?" />
        {specs.length ? (
          <OptionList options={specs.map((s) => ({ href: href(st, { especialidad: s.id }), title: s.name, detail: s.description ?? undefined }))} />
        ) : (
          <p>No hay especialidades disponibles en esta sede.</p>
        )}
      </>
    );
  }
  const specialty = specs.find((s) => s.id === st.especialidad);
  if (!specialty) redirect(upTo(st, "especialidad"));
  summary.push({ label: "Especialidad", value: specialty.name, changeHref: upTo(st, "especialidad") });

  /* 4. Professional */
  const profs = await listProfessionalsPublic(db, clinic.id, specialty.id, locationId);
  if (!st.profesional) {
    if (profs.length === 1) redirect(href(st, { profesional: profs[0].id }));
    return (
      <>
        <ChoicesSummary items={summary} />
        <StepHeading title="¿Con quién?" />
        <OptionList
          options={[
            { href: href(st, { profesional: ANY_PROFESSIONAL }), title: "El primero disponible", detail: "Te mostramos los horarios de todo el equipo", emphasis: true },
            ...profs.map((p) => ({ href: href(st, { profesional: p.id }), title: p.name, detail: p.bio ?? undefined })),
          ]}
        />
      </>
    );
  }
  const professional = st.profesional === ANY_PROFESSIONAL ? null : profs.find((p) => p.id === st.profesional);
  if (st.profesional !== ANY_PROFESSIONAL && !professional) redirect(upTo(st, "profesional"));
  summary.push({ label: "Profesional", value: professional?.name ?? "El primero disponible", changeHref: profs.length > 1 ? upTo(st, "profesional") : undefined });

  /* 5. Consultation type */
  const svcs = await listServicesPublic(db, clinic.id, specialty.id);
  if (!st.consulta) {
    if (svcs.length === 1) redirect(href(st, { consulta: svcs[0].id }));
    return (
      <>
        <ChoicesSummary items={summary} />
        <StepHeading title="¿Qué tipo de consulta?" />
        {svcs.length ? (
          <OptionList
            options={svcs.map((s) => ({
              href: href(st, { consulta: s.id }),
              title: s.name,
              detail: `${s.durationMinutes} minutos${s.priceCents !== null ? `, ${formatMoney(s.priceCents)} particular` : ""}`,
            }))}
          />
        ) : (
          <p>Esta especialidad todavía no tiene tipos de consulta cargados.</p>
        )}
      </>
    );
  }
  const service = svcs.find((s) => s.id === st.consulta);
  if (!service) redirect(upTo(st, "consulta"));
  if (svcs.length > 1) summary.push({ label: "Consulta", value: service.name, changeHref: upTo(st, "consulta") });

  const slotQuery = { clinicId: clinic.id, specialtyId: specialty.id, serviceId: service.id, professionalId: professional?.id ?? null, locationId };
  const info = await getClinicInfo(db, clinic.id);
  const tz = info.timezone;

  /* 6. Day */
  if (!st.dia) {
    const { slots: all } = await findSlots(db, slotQuery, now);
    const days = [...new Set(all.map((s) => s.localDate))];
    const first = all[0];
    const today = utcToLocal(now, tz).date;
    const last = utcToLocal(new Date(now.getTime() + info.bookingHorizonDays * 86_400_000), tz).date;
    return (
      <>
        <ChoicesSummary items={summary} />
        {first ? (
          <a
            href={href(st, { dia: first.localDate, hora: first.startsAt, en: first.locationId, con: first.professionalId })}
            className="group mb-8 flex flex-col gap-1 rounded-xl border-2 border-tinta bg-sol-claro px-4 py-3 hover:bg-sol hover:text-sol-foreground focus-visible:bg-sol focus-visible:text-sol-foreground sm:flex-row sm:items-center sm:justify-between"
          >
            <span>
              <span className="block text-sm font-semibold text-muted-foreground group-hover:text-sol-foreground/80 group-focus-visible:text-sol-foreground/80">El próximo turno libre</span>
              <span className="block text-lg font-bold first-letter:uppercase">
                {longDate(first.localDate)}, {first.localTime} h
              </span>
              <span className="block text-sm">
                {[!professional ? profs.find((p) => p.id === first.professionalId)?.name : null, !location && locs.length > 1 ? locs.find((l) => l.id === first.locationId)?.name : null]
                  .filter(Boolean)
                  .join(", ")}
              </span>
            </span>
            <span className="font-bold text-primary underline underline-offset-4 group-hover:text-sol-foreground group-focus-visible:text-sol-foreground">Reservar este</span>
          </a>
        ) : null}
        <StepHeading title="¿Qué día te queda bien?">
          {days.length ? `${first ? "O elegí otro: los" : "Los"} días marcados tienen horarios libres. ${days.length === 1 ? "Hay 1 día disponible." : `Hay ${days.length} días disponibles.`}` : null}
        </StepHeading>
        {days.length ? (
          <DayCalendar today={today} lastDay={last} available={days} hrefFor={(d) => href(st, { dia: d })} />
        ) : (
          <div className="flex flex-col gap-2">
            <p>No hay horarios libres en los próximos {info.bookingHorizonDays} días.</p>
            {info.phone ? <p>Podés llamar a la clínica al <a className="font-semibold underline" href={`tel:${info.phone}`}>{info.phone}</a>.</p> : null}
          </div>
        )}
      </>
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(st.dia)) redirect(upTo(st, "dia"));
  summary.push({ label: "Día", value: longDate(st.dia), changeHref: upTo(st, "dia") });

  /* 7. Time */
  const { slots } = await findSlots(db, { ...slotQuery, fromDate: st.dia, toDate: st.dia }, now);
  const profName = Object.fromEntries(profs.map((p) => [p.id, p.name]));
  const locName = Object.fromEntries(locs.map((l) => [l.id, l.name]));
  const chosen = st.hora ? slots.find((s) => s.startsAt === st.hora && s.locationId === st.en && s.professionalId === st.con) : undefined;

  if (!chosen) {
    const showProf = !professional;
    const showLoc = !location && locs.length > 1;
    // With «el primero disponible», offer one professional per time (the first).
    const unique = showProf ? slots.filter((s, i) => slots.findIndex((x) => x.startsAt === s.startsAt) === i) : slots;
    const toTicket = (s: (typeof slots)[number]) => ({
      href: href(st, { hora: s.startsAt, en: s.locationId, con: s.professionalId }),
      time: s.localTime,
      detail: [showProf ? profName[s.professionalId] : null, showLoc ? locName[s.locationId] : null].filter(Boolean).join(", ") || undefined,
    });
    return (
      <>
        <ChoicesSummary items={summary} />
        <StepHeading title="Elegí el horario">
          {st.hora ? "Ese horario ya no está disponible. Elegí otro, por favor." : `${service.durationMinutes} minutos de consulta.`}
        </StepHeading>
        {unique.length ? (
          <SlotTickets
            groups={[
              { label: "Mañana", slots: unique.filter((s) => s.localTime < "13:00").map(toTicket) },
              { label: "Tarde", slots: unique.filter((s) => s.localTime >= "13:00" && s.localTime < "19:00").map(toTicket) },
              { label: "Noche", slots: unique.filter((s) => s.localTime >= "19:00").map(toTicket) },
            ]}
          />
        ) : (
          <p>Ya no quedan horarios libres ese día. <a className="font-semibold text-primary underline" href={upTo(st, "dia")}>Elegí otro día</a>.</p>
        )}
      </>
    );
  }

  /* 8. Patient data + explicit confirmation */
  const chosenLocation = locs.find((l) => l.id === chosen.locationId)!;
  return (
    <>
      <StepHeading title="Revisá y confirmá tu turno" />
      <div className="mb-8 grid gap-4 rounded-xl border-2 border-tinta bg-card p-5 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-6">
        <div className="flex flex-col items-center justify-center rounded-lg bg-sol px-5 py-3 text-sol-foreground">
          <span className="text-sm font-semibold first-letter:uppercase">{longDate(chosen.localDate).split(",")[0]}</span>
          <span className="text-3xl font-bold tabular-nums">{chosen.localTime}</span>
          <span className="text-sm font-semibold">{longDate(chosen.localDate).split(", ")[1]}</span>
        </div>
        <dl className="grid gap-1 text-sm">
          <div><dt className="sr-only">Profesional</dt><dd className="text-lg font-bold">{profName[chosen.professionalId]}</dd></div>
          <div><dt className="sr-only">Consulta</dt><dd>{specialty.name}, {service.name.toLowerCase()} ({service.durationMinutes} min)</dd></div>
          <div><dt className="sr-only">Sede</dt><dd>{chosenLocation.name}, {chosenLocation.address}</dd></div>
          <div><dt className="sr-only">Clínica</dt><dd className="text-muted-foreground">{clinic.name}</dd></div>
        </dl>
        <div className="sm:col-span-2">
          <a href={upTo(st, "hora")} className="text-sm text-primary underline underline-offset-4">Cambiar horario</a>
        </div>
      </div>
      <BookingForm
        slot={{ professionalId: chosen.professionalId, locationId: chosen.locationId, serviceId: service.id, startsAt: chosen.startsAt }}
        backToTimes={upTo(st, "hora")}
        cancelMinHours={info.cancelMinHours}
      />
    </>
  );
}
