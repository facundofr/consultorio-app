import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db/client";
import { clinics, users } from "@/db/schema";
import { getAuth } from "./auth";
import type { Actor } from "./rbac";

/** Current admin user (re-read from the database on every request), or null. */
export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  const [u] = await getDb()
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, clinicId: users.clinicId, active: users.active })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!u || !u.active) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role, clinicId: u.clinicId };
});

/** For admin pages and actions: redirects to the login page if not signed in. */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/admin/login");
  return actor;
}

export const ACTIVE_CLINIC_COOKIE = "turnos_admin_clinic";

/**
 * The clinic the admin panel is showing. Fixed for clinic users; superadmins
 * pick one (stored in a cookie) and default to the first active clinic.
 */
export const getActiveClinicId = cache(async (actor: Actor): Promise<string | null> => {
  if (actor.role !== "superadmin") return actor.clinicId;
  const wanted = (await cookies()).get(ACTIVE_CLINIC_COOKIE)?.value;
  const list = await getDb()
    .select({ id: clinics.id })
    .from(clinics)
    .where(and(isNull(clinics.deletedAt)))
    .orderBy(clinics.name);
  if (wanted && list.some((c) => c.id === wanted)) return wanted;
  return list[0]?.id ?? null;
});

/** Actor + active clinic, the common prelude of every admin page. */
export async function requireAdminContext() {
  const actor = await requireActor();
  const clinicId = await getActiveClinicId(actor);
  return { actor, clinicId };
}
