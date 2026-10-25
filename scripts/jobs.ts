/**
 * Run every background job once and exit. Alternative to the in-app
 * scheduler (set JOBS_ENABLED=false in the app and call this from cron):
 *
 *   * * * * *  cd /app && pnpm jobs
 */
import "dotenv/config";
import { closeDb, getDb } from "../src/db/client";
import { runDueJobs } from "../src/server/jobs";

async function main() {
  const results = await runDueJobs(getDb(), { force: true });
  console.log(JSON.stringify(results));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
