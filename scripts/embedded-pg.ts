import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import path from "node:path";

export type EmbeddedPg = {
  url: (db: string) => string;
  pg: EmbeddedPostgres;
  stop: () => Promise<void>;
};

/**
 * Start a real PostgreSQL 17 server from the `embedded-postgres` npm package.
 * Used by the test suite and by `pnpm db:embedded` for Docker-less development.
 */
export async function startEmbeddedPostgres(opts: {
  dir: string;
  port: number;
  fresh?: boolean;
  quiet?: boolean;
}): Promise<EmbeddedPg> {
  const databaseDir = path.resolve(opts.dir);
  if (opts.fresh) fs.rmSync(databaseDir, { recursive: true, force: true });
  const needsInit = !fs.existsSync(path.join(databaseDir, "PG_VERSION"));

  const user = "postgres";
  const password = "postgres";
  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  const noop = () => {};

  const pg = new EmbeddedPostgres({
    databaseDir,
    port: opts.port,
    user,
    password,
    persistent: !opts.fresh,
    createPostgresUser: isRoot,
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    postgresFlags: ["-c", "timezone=UTC", "-c", "fsync=off"],
    onLog: opts.quiet ? noop : console.log,
    onError: opts.quiet ? noop : console.error,
  });

  if (needsInit) await pg.initialise();
  await pg.start();

  return {
    pg,
    url: (db: string) => `postgres://${user}:${password}@127.0.0.1:${opts.port}/${db}`,
    stop: () => pg.stop(),
  };
}
