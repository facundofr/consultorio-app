import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { clinics, settings } from "@/db/schema";
import { DomainError } from "@/server/errors";

export type ClinicContext = {
  clinic: typeof clinics.$inferSelect;
  settings: typeof settings.$inferSelect;
};

/** Clinic + its settings (creates default settings on the fly if missing). */
export async function getClinicContext(db: DbOrTx, clinicId: string): Promise<ClinicContext> {
  const [clinic] = await db.select().from(clinics).where(eq(clinics.id, clinicId)).limit(1);
  if (!clinic || clinic.deletedAt) throw new DomainError("NOT_FOUND", "No encontramos esa clínica.");
  let [row] = await db.select().from(settings).where(eq(settings.clinicId, clinicId)).limit(1);
  if (!row) {
    [row] = await db.insert(settings).values({ clinicId }).onConflictDoNothing().returning();
    if (!row) [row] = await db.select().from(settings).where(eq(settings.clinicId, clinicId)).limit(1);
  }
  return { clinic, settings: row };
}
