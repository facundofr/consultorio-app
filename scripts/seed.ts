/**
 * pnpm seed            → load demo data into an EMPTY database
 * pnpm seed --reset    → wipe every table first (asks nothing: dev/demo only)
 *
 * Refuses to run when NODE_ENV=production unless SEED_ALLOW_PRODUCTION=true.
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { createDb } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { clinics } from "../src/db/schema";
import { seedDemo } from "../src/db/seed";
import { seedAdminUsers } from "../src/db/seed-users";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (process.env.NODE_ENV === "production" && process.env.SEED_ALLOW_PRODUCTION !== "true") {
    throw new Error("Seed is disabled in production (set SEED_ALLOW_PRODUCTION=true for a demo server).");
  }
  const reset = process.argv.includes("--reset");

  await runMigrations(url);
  const { db, sql: client } = createDb(url, 4);
  try {
    if (reset) {
      await db.execute(sql`
        DO $$ DECLARE t text; BEGIN
          SELECT string_agg(format('%I.%I', schemaname, tablename), ', ') INTO t
            FROM pg_tables WHERE schemaname = 'public';
          IF t IS NOT NULL THEN EXECUTE 'TRUNCATE ' || t || ' RESTART IDENTITY CASCADE'; END IF;
        END $$;`);
      console.log("Base vaciada.");
    } else {
      const existing = await db.select({ id: clinics.id }).from(clinics).limit(1);
      if (existing.length) {
        console.log("La base ya tiene datos. Usá `pnpm seed --reset` para empezar de cero.");
        return;
      }
    }
    const result = await seedDemo(db);
    const users = await seedAdminUsers(db);
    console.log("Seed listo:", { ...result, users: users.length });
    console.log("\nUsuarios del panel (/admin):");
    for (const u of users) console.log(`  ${u.role.padEnd(13)} ${u.email.padEnd(32)} ${u.password}`);
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
