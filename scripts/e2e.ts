/**
 * End-to-end tests against a production build and a throw-away database.
 *
 *   pnpm test:e2e            → build if needed, start Postgres, seed, run Playwright
 *   pnpm test:e2e --rebuild  → force a fresh `next build`
 *
 * Extra arguments are passed to `playwright test` (e.g. a file name or --ui).
 */
import { execSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createDb } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { seedDemo } from "../src/db/seed";
import { seedAdminUsers } from "../src/db/seed-users";
import { startEmbeddedPostgres } from "./embedded-pg";
import { and, eq } from "drizzle-orm";
import type { Db } from "../src/db/client";
import { professionalLocations, professionals, professionalSpecialties, services } from "../src/db/schema";
import { createAppointment } from "../src/server/appointments/create";

/**
 * An appointment that starts in ~3 hours (inside the 24 h window), so the
 * "cannot cancel online" path can be tested end to end.
 */
async function writeFixtures(db: Db) {
  const [prof] = await db.select().from(professionals).where(and(eq(professionals.firstName, "Lucía"), eq(professionals.lastName, "Ferrante")));
  const [loc] = await db.select().from(professionalLocations).where(eq(professionalLocations.professionalId, prof.id));
  const [spec] = await db.select().from(professionalSpecialties).where(eq(professionalSpecialties.professionalId, prof.id));
  const [svc] = await db.select().from(services).where(eq(services.specialtyId, spec.specialtyId));
  const startsAt = new Date(Math.ceil((Date.now() + 3 * 3_600_000) / 900_000) * 900_000);
  const soon = await createAppointment(
    db,
    {
      professionalId: prof.id,
      locationId: loc.locationId,
      serviceId: svc.id,
      startsAt,
      patient: { fullName: "Paciente Ventana Cerrada", phone: "11 7000-0001", email: "ventana@example.com" },
      consent: true,
    },
    { source: "admin", allowOutsideGrid: true },
  );
  fs.mkdirSync("tests/e2e/.auth", { recursive: true });
  fs.writeFileSync(
    "tests/e2e/.auth/fixtures.json",
    JSON.stringify({ soon: { code: soon.appointment.code, token: soon.cancelToken, phone: "11 7000-0001" } }, null, 2),
  );
}

export const E2E_PASSWORD = "e2e-password-123";

async function main() {
  const args = process.argv.slice(2);
  const rebuild = args.includes("--rebuild");
  const pwArgs = args.filter((a) => a !== "--rebuild");

  const standalone = path.join(".next", "standalone", "server.js");
  if (rebuild || !fs.existsSync(standalone)) {
    execSync("pnpm build", { stdio: "inherit" });
  }
  // `output: standalone` does not include static assets: copy them next to the server.
  fs.cpSync(path.join(".next", "static"), path.join(".next", "standalone", ".next", "static"), { recursive: true });
  if (fs.existsSync("public")) fs.cpSync("public", path.join(".next", "standalone", "public"), { recursive: true });

  const pg = await startEmbeddedPostgres({ dir: ".pg-e2e", port: Number(process.env.E2E_PG_PORT ?? 54330), fresh: true, quiet: true });
  let code = 1;
  try {
    await pg.pg.createDatabase("turnos_e2e");
    const url = pg.url("turnos_e2e");
    const env = {
      ...process.env,
      NODE_ENV: "production" as const,
      DATABASE_URL: url,
      APP_URL: "http://127.0.0.1:3100",
      PORT: "3100",
      HOSTNAME: "127.0.0.1",
      PII_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
      PII_HASH_KEY: randomBytes(32).toString("base64"),
      BETTER_AUTH_SECRET: randomBytes(32).toString("base64"),
      AI_ENABLED: process.env.AI_ENABLED ?? "true",
      LLM_MOCK: "1",
      // Never send real emails from tests, whatever the local .env says: they stay in the test inbox.
      SMTP_HOST: "",
      // Two-factor is exercised explicitly in security.spec.ts.
      TWO_FACTOR_REQUIRED_ROLES: "",
      JOBS_ENABLED: "true",
      E2E: "1",
    };
    Object.assign(process.env, env);
    await runMigrations(url);
    const holder = createDb(url, 2);
    await seedDemo(holder.db);
    await seedAdminUsers(holder.db, E2E_PASSWORD);
    await writeFixtures(holder.db);
    await holder.sql.end();

    // On Windows pnpm is a .cmd shim, which only runs through a shell.
    const res = spawnSync("pnpm", ["exec", "playwright", "test", ...pwArgs], { stdio: "inherit", env, shell: process.platform === "win32" });
    if (res.error) console.error(res.error);
    code = res.status ?? 1;
  } finally {
    await pg.stop();
  }
  process.exit(code);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
