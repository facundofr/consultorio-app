import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";

/**
 * Queue writes that touch one professional's agenda (booking, moving).
 *
 * Without it, many concurrent inserts on the same slot wait on each other
 * while checking the exclusion constraint and Postgres resolves that as a
 * deadlock (about 1 s each). With the lock they run one after another: the
 * availability re-check sees the winner and the rest fail fast. The exclusion
 * constraint is still the final guard. Released at commit or rollback.
 */
export async function lockProfessionalAgenda(tx: Tx, professionalId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"agenda:" + professionalId}, 0))`);
}
