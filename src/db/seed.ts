/**
 * Demo data. Everything here is INVENTED: clinics, people, addresses and
 * phone numbers are fictional. Holidays are Argentina's national holidays.
 */
import { eq } from "drizzle-orm";
import type { Db } from "./client";
import {
  clinics,
  kbDocs,
  locations,
  professionalLocations,
  professionals,
  professionalSpecialties,
  scheduleExceptions,
  scheduleRules,
  services,
  settings,
  specialties,
} from "./schema";
import { addDays, localToUtc, utcToLocal } from "@/lib/time";
import { createAppointment } from "@/server/appointments/create";
import { getAvailableSlots } from "@/server/availability/service";

const TZ = "America/Argentina/Buenos_Aires";

/** National holidays (feriados nacionales). 2027 movable holidays are not decreed yet. */
export const AR_HOLIDAYS: [string, string][] = [
  ["2026-01-01", "Año Nuevo"],
  ["2026-02-16", "Carnaval"],
  ["2026-02-17", "Carnaval"],
  ["2026-03-24", "Día Nacional de la Memoria por la Verdad y la Justicia"],
  ["2026-04-02", "Día del Veterano y de los Caídos en la Guerra de Malvinas"],
  ["2026-04-03", "Viernes Santo"],
  ["2026-05-01", "Día del Trabajador"],
  ["2026-05-25", "Día de la Revolución de Mayo"],
  ["2026-06-15", "Paso a la Inmortalidad del Gral. Güemes"],
  ["2026-06-20", "Paso a la Inmortalidad del Gral. Belgrano"],
  ["2026-07-09", "Día de la Independencia"],
  ["2026-08-17", "Paso a la Inmortalidad del Gral. San Martín"],
  ["2026-10-12", "Día del Respeto a la Diversidad Cultural"],
  ["2026-11-23", "Día de la Soberanía Nacional"],
  ["2026-12-08", "Inmaculada Concepción de María"],
  ["2026-12-25", "Navidad"],
  ["2027-01-01", "Año Nuevo"],
  ["2027-02-08", "Carnaval"],
  ["2027-02-09", "Carnaval"],
  ["2027-03-24", "Día Nacional de la Memoria por la Verdad y la Justicia"],
  ["2027-03-26", "Viernes Santo"],
  ["2027-04-02", "Día del Veterano y de los Caídos en la Guerra de Malvinas"],
  ["2027-05-01", "Día del Trabajador"],
  ["2027-05-25", "Día de la Revolución de Mayo"],
  ["2027-06-20", "Paso a la Inmortalidad del Gral. Belgrano"],
  ["2027-07-09", "Día de la Independencia"],
  ["2027-12-08", "Inmaculada Concepción de María"],
  ["2027-12-25", "Navidad"],
];

type Shift = { loc: string; days: number[]; from: string; to: string };
type ProfSeed = {
  clinic: string;
  title: string;
  first: string;
  last: string;
  license: string;
  specialties: string[];
  shifts: Shift[];
  bio?: string;
};

const PROFESSIONALS: ProfSeed[] = [
  // ---- Centro Médico Aurora (2 sedes) ----
  { clinic: "aurora", title: "Dra.", first: "Lucía", last: "Ferrante", license: "MN 100231", specialties: ["clinica-medica"],
    shifts: [{ loc: "centro", days: [1, 2, 3, 4, 5], from: "08:00", to: "12:00" }] },
  { clinic: "aurora", title: "Dr.", first: "Martín", last: "Galván", license: "MN 100877", specialties: ["clinica-medica"],
    shifts: [
      { loc: "norte", days: [1, 3, 5], from: "14:00", to: "19:00" },
      { loc: "centro", days: [6], from: "09:00", to: "12:00" },
    ] },
  { clinic: "aurora", title: "Dra.", first: "Carolina", last: "Rivas", license: "MN 101502", specialties: ["pediatria"],
    shifts: [
      { loc: "centro", days: [1, 2, 3, 4], from: "09:00", to: "13:00" },
      { loc: "centro", days: [2], from: "15:00", to: "18:00" },
    ] },
  { clinic: "aurora", title: "Dr.", first: "Pablo", last: "Soria", license: "MN 102110", specialties: ["pediatria", "clinica-medica"],
    shifts: [{ loc: "norte", days: [2, 4], from: "08:00", to: "13:00" }] },
  { clinic: "aurora", title: "Dr.", first: "Andrés", last: "Molinari", license: "MN 098450", specialties: ["cardiologia"],
    shifts: [
      { loc: "centro", days: [1, 3], from: "15:00", to: "20:00" },
      { loc: "norte", days: [5], from: "09:00", to: "13:00" },
    ] },
  { clinic: "aurora", title: "Dra.", first: "Valeria", last: "Pazos", license: "MN 103388", specialties: ["dermatologia"],
    shifts: [{ loc: "norte", days: [2, 4], from: "10:00", to: "16:00" }] },
  { clinic: "aurora", title: "Dra.", first: "Sofía", last: "Herrán", license: "MN 104009", specialties: ["ginecologia"],
    shifts: [{ loc: "centro", days: [1, 2, 3, 4, 5], from: "13:00", to: "17:00" }] },
  { clinic: "aurora", title: "Dra.", first: "Julieta", last: "Acuña", license: "MN 104721", specialties: ["ginecologia"],
    shifts: [
      { loc: "norte", days: [6], from: "09:00", to: "13:00" },
      { loc: "norte", days: [3], from: "17:00", to: "21:00" },
    ] },
  // ---- Clínica Los Aromos (1 sede) ----
  { clinic: "aromos", title: "Dr.", first: "Diego", last: "Romano", license: "MP 55120", specialties: ["traumatologia"],
    shifts: [{ loc: "aromos", days: [1, 3, 5], from: "08:00", to: "12:00" }] },
  { clinic: "aromos", title: "Dra.", first: "Natalia", last: "Castell", license: "MP 55871", specialties: ["traumatologia"],
    shifts: [{ loc: "aromos", days: [2, 4], from: "14:00", to: "20:00" }] },
  { clinic: "aromos", title: "Dr.", first: "Federico", last: "Lunardi", license: "MP 56302", specialties: ["oftalmologia"],
    shifts: [{ loc: "aromos", days: [1, 2, 3, 4], from: "09:00", to: "14:00" }] },
  { clinic: "aromos", title: "Lic.", first: "Mariana", last: "Vergara", license: "MP 57014", specialties: ["nutricion"],
    shifts: [{ loc: "aromos", days: [2, 5], from: "10:00", to: "18:00" }],
    bio: "Licenciada en Nutrición. Planes de alimentación para adultos." },
];

const SPECIALTIES: Record<string, { clinic: string; name: string; services: [string, number, number | null][] }> = {
  "clinica-medica": { clinic: "aurora", name: "Clínica médica", services: [["Consulta", 20, null], ["Control con estudios", 30, null]] },
  pediatria: { clinic: "aurora", name: "Pediatría", services: [["Consulta pediátrica", 20, null], ["Control de niño sano", 30, null]] },
  cardiologia: { clinic: "aurora", name: "Cardiología", services: [["Consulta", 30, null], ["Primera consulta", 45, null]] },
  dermatologia: { clinic: "aurora", name: "Dermatología", services: [["Consulta", 20, null], ["Control de lunares", 30, 3500000]] },
  ginecologia: { clinic: "aurora", name: "Ginecología", services: [["Consulta", 30, null], ["Control anual", 30, null]] },
  traumatologia: { clinic: "aromos", name: "Traumatología", services: [["Consulta", 20, null], ["Primera consulta", 40, null]] },
  oftalmologia: { clinic: "aromos", name: "Oftalmología", services: [["Consulta", 20, null], ["Fondo de ojo", 30, 2800000]] },
  nutricion: { clinic: "aromos", name: "Nutrición", services: [["Primera consulta", 60, 4500000], ["Seguimiento", 30, 3000000]] },
};

const FAQ = (clinicName: string, phone: string): [string, string, string[]][] => [
  ["¿Qué tengo que llevar al turno?", "Traé tu DNI y la credencial de tu cobertura. Si tenés estudios previos relacionados con la consulta, traelos también.", ["documentacion"]],
  ["¿Con cuánta anticipación tengo que llegar?", "Te pedimos llegar 10 minutos antes para hacer la admisión en recepción.", ["llegada"]],
  ["¿Cómo cancelo un turno?", "Podés cancelar desde el enlace que ves al confirmar la reserva, desde «Mi turno» o desde este chat con tu código de turno y tu teléfono o email, hasta 24 horas antes. Pasado ese plazo, llamá a la clínica.", ["cancelacion"]],
  ["¿Qué coberturas aceptan?", `En ${clinicName} atendemos afiliados de las prepagas y obras sociales con convenio y también en forma particular. Consultá tu plan llamando al ${phone}.`, ["coberturas"]],
  ["¿Puedo ir acompañado?", "Sí, podés venir con un acompañante. Los menores de edad tienen que venir con una persona adulta responsable.", ["acompanante"]],
  ["¿Hay estacionamiento?", "No tenemos estacionamiento propio. Hay estacionamientos pagos en la zona.", ["estacionamiento"]],
  ["¿Hacen certificados médicos?", "El profesional puede extender un certificado durante la consulta si corresponde.", ["certificados"]],
  ["¿Cómo me comunico con la clínica?", `Llamanos al ${phone} de lunes a viernes de 8 a 20 h.`, ["contacto"]],
];

export type SeedResult = {
  clinics: number;
  locations: number;
  specialties: number;
  professionals: number;
  services: number;
  holidays: number;
  appointments: number;
};

/** Insert demo data. Assumes an empty database. */
export async function seedDemo(db: Db, now = new Date(), opts: { appointments?: boolean } = {}): Promise<SeedResult> {
  const [aurora, aromos] = await db
    .insert(clinics)
    .values([
      { name: "Centro Médico Aurora", slug: "aurora", phone: "011 4000-1000", email: "turnos@aurora.example", timezone: TZ },
      { name: "Clínica Los Aromos", slug: "aromos", phone: "011 4000-2000", email: "turnos@aromos.example", timezone: TZ },
    ])
    .returning();
  const clinicBySlug: Record<string, typeof aurora> = { aurora, aromos };

  await db.insert(settings).values([
    {
      clinicId: aurora.id,
      contactPhone: "011 4000-1000",
      contactEmail: "turnos@aurora.example",
      contactHours: "Lunes a viernes de 8 a 20 h",
      welcomeText: "¡Hola! Soy el asistente de turnos del Centro Médico Aurora. ¿Querés sacar un turno?",
    },
    {
      clinicId: aromos.id,
      contactPhone: "011 4000-2000",
      contactEmail: "turnos@aromos.example",
      contactHours: "Lunes a viernes de 8 a 19 h",
      slotStepMinutes: 20,
      welcomeText: "¡Hola! Soy el asistente de turnos de Clínica Los Aromos. ¿En qué te ayudo?",
    },
  ]);

  const locs = await db
    .insert(locations)
    .values([
      { clinicId: aurora.id, name: "Sede Centro", address: "Av. Inventada 1234, CABA", city: "CABA", phone: "011 4000-1001" },
      { clinicId: aurora.id, name: "Sede Norte", address: "Calle Imaginaria 567, Vicente López", city: "Vicente López", phone: "011 4000-1002" },
      { clinicId: aromos.id, name: "Sede Los Aromos", address: "Pasaje Ficticio 89, Quilmes", city: "Quilmes", phone: "011 4000-2001" },
    ])
    .returning();
  const locByKey: Record<string, string> = { centro: locs[0].id, norte: locs[1].id, aromos: locs[2].id };

  const specRows = await db
    .insert(specialties)
    .values(Object.entries(SPECIALTIES).map(([slug, s]) => ({ clinicId: clinicBySlug[s.clinic].id, slug, name: s.name })))
    .returning();
  const specBySlug = Object.fromEntries(specRows.map((s) => [s.slug, s]));

  const svcRows = await db
    .insert(services)
    .values(
      Object.entries(SPECIALTIES).flatMap(([slug, s]) =>
        s.services.map(([name, durationMinutes, priceCents]) => ({
          clinicId: clinicBySlug[s.clinic].id,
          specialtyId: specBySlug[slug].id,
          name,
          durationMinutes,
          priceCents,
        })),
      ),
    )
    .returning();

  const profRows: (typeof professionals.$inferSelect)[] = [];
  for (const p of PROFESSIONALS) {
    const [row] = await db
      .insert(professionals)
      .values({
        clinicId: clinicBySlug[p.clinic].id,
        title: p.title,
        firstName: p.first,
        lastName: p.last,
        licenseNumber: p.license,
        bio: p.bio,
      })
      .returning();
    profRows.push(row);
    await db.insert(professionalSpecialties).values(p.specialties.map((s) => ({ professionalId: row.id, specialtyId: specBySlug[s].id })));
    const locKeys = [...new Set(p.shifts.map((s) => s.loc))];
    await db.insert(professionalLocations).values(locKeys.map((k) => ({ professionalId: row.id, locationId: locByKey[k] })));
    await db.insert(scheduleRules).values(
      p.shifts.flatMap((s) =>
        s.days.map((weekday) => ({ professionalId: row.id, locationId: locByKey[s.loc], weekday, startTime: s.from, endTime: s.to })),
      ),
    );
  }

  // Holidays for both clinics.
  const holidayRows = [aurora, aromos].flatMap((c) =>
    AR_HOLIDAYS.map(([date, reason]) => ({
      clinicId: c.id,
      scope: "clinic" as const,
      kind: "block" as const,
      startsAt: localToUtc(date, 0, TZ),
      endsAt: localToUtc(addDays(date, 1), 0, TZ),
      reason: `Feriado: ${reason}`,
    })),
  );
  await db.insert(scheduleExceptions).values(holidayRows);

  // A few realistic exceptions relative to "now".
  const today = utcToLocal(now, TZ).date;
  const valeria = profRows[5];
  const federico = profRows[10];
  const nextSaturday = (() => {
    let d = addDays(today, 1);
    while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 6) d = addDays(d, 1);
    return d;
  })();
  await db.insert(scheduleExceptions).values([
    {
      clinicId: aurora.id,
      scope: "professional",
      kind: "block",
      professionalId: valeria.id,
      startsAt: localToUtc(addDays(today, 21), 0, TZ),
      endsAt: localToUtc(addDays(today, 35), 0, TZ),
      reason: "Vacaciones",
    },
    {
      clinicId: aromos.id,
      scope: "professional",
      kind: "extra",
      professionalId: federico.id,
      locationId: locByKey.aromos,
      startsAt: localToUtc(nextSaturday, 9 * 60, TZ),
      endsAt: localToUtc(nextSaturday, 12 * 60, TZ),
      reason: "Atención extra sábado",
    },
    {
      clinicId: aurora.id,
      scope: "location",
      kind: "block",
      locationId: locByKey.norte,
      startsAt: localToUtc(addDays(today, 10), 8 * 60, TZ),
      endsAt: localToUtc(addDays(today, 10), 12 * 60, TZ),
      reason: "Mantenimiento de la sede",
    },
  ]);

  await db.insert(kbDocs).values([
    ...FAQ(aurora.name, "011 4000-1000").map(([question, answer, tags]) => ({ clinicId: aurora.id, question, answer, tags })),
    ...FAQ(aromos.name, "011 4000-2000").map(([question, answer, tags]) => ({ clinicId: aromos.id, question, answer, tags })),
  ]);

  // Sample appointments so the agenda and dashboard are not empty.
  let appointmentsCreated = 0;
  if (opts.appointments !== false) {
    const samplePatients = [
      { fullName: "Laura Benítez", phone: "11 5550-0101", email: "laura.benitez@example.com" },
      { fullName: "Jorge Medina", phone: "11 5550-0102", email: "jorge.medina@example.com" },
      { fullName: "Camila Ortiz", phone: "11 5550-0103", email: "camila.ortiz@example.com" },
      { fullName: "Ricardo Funes", phone: "11 5550-0104", email: "ricardo.funes@example.com" },
      { fullName: "Agustina Peralta", phone: "11 5550-0105", email: "agustina.peralta@example.com" },
      { fullName: "Tomás Quiroga", phone: "11 5550-0106", email: "tomas.quiroga@example.com" },
    ];
    const sources = ["ai", "form", "admin"] as const;
    let i = 0;
    for (const prof of profRows.slice(0, 6).concat(profRows.slice(8, 10))) {
      const [link] = await db.select().from(professionalSpecialties).where(eq(professionalSpecialties.professionalId, prof.id));
      const svc = svcRows.find((s) => s.specialtyId === link.specialtyId)!;
      const { slots } = await getAvailableSlots(
        db,
        { professionalId: prof.id, serviceId: svc.id, from: now, to: new Date(now.getTime() + 10 * 86_400_000) },
        now,
      );
      for (const slot of [slots[1], slots[4]].filter(Boolean)) {
        const p = samplePatients[i % samplePatients.length];
        const source = sources[i % sources.length];
        i++;
        await createAppointment(
          db,
          { professionalId: prof.id, locationId: slot.locationId, serviceId: svc.id, startsAt: slot.startsAt, patient: p, consent: true },
          { source, now },
        );
        appointmentsCreated++;
      }
    }
  }

  return {
    clinics: 2,
    locations: locs.length,
    specialties: specRows.length,
    professionals: profRows.length,
    services: svcRows.length,
    holidays: holidayRows.length,
    appointments: appointmentsCreated,
  };
}
