import { migrate } from "drizzle-orm/postgres-js/migrator";
import path from "node:path";
import { createDb } from "./client";

/** Apply all pending migrations from ./drizzle. Safe to run on every boot. */
export async function runMigrations(url: string, migrationsFolder?: string) {
  const holder = createDb(url, 1);
  try {
    await migrate(holder.db, {
      migrationsFolder: migrationsFolder ?? path.join(process.cwd(), "drizzle"),
    });
  } finally {
    await holder.sql.end({ timeout: 5 });
  }
}
