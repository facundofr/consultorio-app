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
      E2E: "1",
    };
    Object.assign(process.env, env);
    await runMigrations(url);
    const holder = createDb(url, 2);
    await seedDemo(holder.db);
    await seedAdminUsers(holder.db, E2E_PASSWORD);
    await holder.sql.end();

    const res = spawnSync("pnpm", ["exec", "playwright", "test", ...pwArgs], { stdio: "inherit", env });
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
