/**
 * Docker-less development database: a real PostgreSQL 17 from npm.
 *   pnpm db:embedded   → listens on 127.0.0.1:5433, data in ./.pg-dev
 * Then set DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/turnos
 */
import { startEmbeddedPostgres } from "./embedded-pg";

const port = Number(process.env.DEV_PG_PORT ?? 5433);

async function main() {
  const server = await startEmbeddedPostgres({ dir: ".pg-dev", port, quiet: true });
  try {
    await server.pg.createDatabase("turnos");
  } catch {
    // already exists
  }
  console.log(`PostgreSQL 17 listo en ${server.url("turnos")}  (Ctrl+C para detener)`);
  const stop = async () => {
    await server.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
