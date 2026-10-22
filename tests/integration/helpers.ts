import { sql } from "drizzle-orm";
import { createDb, type Db } from "@/db/client";
import {
  clinics,
  locations,
  professionalLocations,
  professionals,
  professionalSpecialties,
  scheduleRules,
  services,
  settings,
  specialties,
} from "@/db/schema";

export function testDb(poolMax = 20) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not provided to integration tests");
  return createDb(url, poolMax);
}

/** Wipe every application table (keeps migrations). */
export async function resetDb(db: Db) {
  await db.execute(sql`
    DO $$
    DECLARE t text;
    BEGIN
      SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
        INTO t
        FROM pg_tables
       WHERE schemaname = 'public';
      IF t IS NOT NULL THEN
        EXECUTE 'TRUNCATE ' || t || ' RESTART IDENTITY CASCADE';
      END IF;
    END $$;
  `);
}

/** Buenos Aires wall clock → UTC Date. */
export const ar = (date: string, time: string) => new Date(`${date}T${time}:00-03:00`);

export type Fixture = Awaited<ReturnType<typeof makeFixture>>;

/**
 * One clinic, two locations, one specialty, one professional working
 * Mon–Fri 09:00–13:00 at location A and Tue 15:00–18:00 at location B,
 * a 30-minute service. Lead time 0 so tests control "now" precisely.
 */
export async function makeFixture(db: Db, overrides: { cancelMinHours?: number; minLeadMinutes?: number } = {}) {
  const [clinic] = await db.insert(clinics).values({ name: "Clínica Test", slug: `test-${Date.now()}-${Math.random()}` }).returning();
  await db.insert(settings).values({
    clinicId: clinic.id,
    slotStepMinutes: 30,
    minLeadMinutes: overrides.minLeadMinutes ?? 0,
    bookingHorizonDays: 120,
    cancelMinHours: overrides.cancelMinHours ?? 24,
    contactPhone: "011 4000-0000",
  });
  const [locA, locB] = await db
    .insert(locations)
    .values([
      { clinicId: clinic.id, name: "Sede A", address: "Calle Falsa 123" },
      { clinicId: clinic.id, name: "Sede B", address: "Av. Siempreviva 742" },
    ])
    .returning();
  const [spec] = await db.insert(specialties).values({ clinicId: clinic.id, name: "Clínica médica", slug: "clinica-medica" }).returning();
  const [prof] = await db
    .insert(professionals)
    .values({ clinicId: clinic.id, title: "Dra.", firstName: "Ana", lastName: "Prueba" })
    .returning();
  await db.insert(professionalSpecialties).values({ professionalId: prof.id, specialtyId: spec.id });
  await db.insert(professionalLocations).values([
    { professionalId: prof.id, locationId: locA.id },
    { professionalId: prof.id, locationId: locB.id },
  ]);
  const [svc] = await db
    .insert(services)
    .values({ clinicId: clinic.id, specialtyId: spec.id, name: "Consulta", durationMinutes: 30 })
    .returning();
  const [longSvc] = await db
    .insert(services)
    .values({ clinicId: clinic.id, specialtyId: spec.id, name: "Primera consulta", durationMinutes: 60 })
    .returning();
  await db.insert(scheduleRules).values([
    ...[1, 2, 3, 4, 5].map((weekday) => ({
      professionalId: prof.id,
      locationId: locA.id,
      weekday,
      startTime: "09:00",
      endTime: "13:00",
    })),
    { professionalId: prof.id, locationId: locB.id, weekday: 2, startTime: "15:00", endTime: "18:00" },
  ]);
  return { clinic, locA, locB, spec, prof, svc, longSvc };
}

export const patient = (n = 1) => ({
  fullName: `Paciente Prueba ${n}`,
  phone: `+54 9 11 5555-${String(1000 + n).slice(-4)}`,
  email: `paciente${n}@example.com`,
});
