import type { TestProject } from "vitest/node";
import { startEmbeddedPostgres, type EmbeddedPg } from "../../scripts/embedded-pg";
import { runMigrations } from "../../src/db/migrate";

let server: EmbeddedPg | undefined;

/**
 * Integration tests run against a real, throw-away PostgreSQL 17 instance.
 * Set TEST_DATABASE_URL to reuse an existing server instead (e.g. in CI).
 */
export default async function setup(project: TestProject) {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    const port = Number(process.env.TEST_PG_PORT ?? 54329);
    server = await startEmbeddedPostgres({ dir: ".pg-test", port, fresh: true, quiet: true });
    await server.pg.createDatabase("turnos_test");
    url = server.url("turnos_test");
  }
  await runMigrations(url);
  project.provide("databaseUrl", url);

  return async () => {
    if (server) await server.stop();
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
