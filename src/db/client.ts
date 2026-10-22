import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;
/** A transaction handle has the same query API as the db. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

type Holder = { sql: postgres.Sql; db: Db; url: string };

// Survive Next.js dev hot reloads without leaking connections.
const globalForDb = globalThis as unknown as { __turnosDb?: Holder };

export function createDb(url: string, max = 10): Holder {
  const sql = postgres(url, {
    max,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });
  return { sql, db: drizzle(sql, { schema }), url };
}

export function getDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (!globalForDb.__turnosDb || globalForDb.__turnosDb.url !== url) {
    globalForDb.__turnosDb = createDb(url, Number(process.env.DATABASE_POOL_MAX ?? 10));
  }
  return globalForDb.__turnosDb.db;
}

export async function closeDb() {
  if (globalForDb.__turnosDb) {
    await globalForDb.__turnosDb.sql.end({ timeout: 5 });
    globalForDb.__turnosDb = undefined;
  }
}

export { schema };
