import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db/client";
import { clinics, sessions, users } from "@/db/schema";
import { getAuth } from "./auth";
import type { Actor } from "./rbac";
import { twoFactorRequired } from "./two-factor";

/**
 * The Better Auth session plus our own checks (re-read from the database on
 * every request): the user must be active and, with two-factor on, this
 * session must have passed the second step.
 */
const loadSession = cache(async () => {
  // Read the request first: it marks the page as dynamic before anything touches
  // the database, so `next build` never tries to prerender admin pages.
  const h = await headers();
  const session = await getAuth().api.getSession({ headers: h });
  if (!session) return null;
  const [row] = await getDb()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      clinicId: users.clinicId,
      active: users.active,
      totpEnabledAt: users.totpEnabledAt,
      verifiedAt: sessions.twoFactorVerifiedAt,
    })
    .from(users)
    .innerJoin(sessions, and(eq(sessions.userId, users.id), eq(sessions.id, session.session.id)))
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!row || !row.active) return null;
  return { ...row, sessionId: session.session.id, pendingTwoFactor: !!row.totpEnabledAt && !row.verifiedAt };
});

/** Current admin user, or null (also null while the second factor is pending). */
export const getActor = cache(async (): Promise<Actor | null> => {
  const s = await loadSession();
  if (!s || s.pendingTwoFactor) return null;
  return { id: s.id, name: s.name, email: s.email, role: s.role, clinicId: s.clinicId, twoFactorEnabled: !!s.totpEnabledAt, sessionId: s.sessionId };
});

/** Signed in with the password, waiting for the 6-digit code. */
export async function getPendingTwoFactor() {
  const s = await loadSession();
  return s?.pendingTwoFactor ? { userId: s.id, sessionId: s.sessionId, email: s.email } : null;
}

/**
 * Signed in (second factor done if enabled), without the "must set up
 * two-factor" gate. Only for the account/security page and its actions,
 * which live outside the panel layout.
 */
export async function requireSignedIn(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) {
    if (await getPendingTwoFactor()) redirect("/admin/login/verificar");
    redirect("/admin/login");
  }
  return actor;
}

/**
 * For every panel page and action: as requireSignedIn, and users whose role
 * requires two-factor are sent to set it up before anything else.
 */
export async function requireActor(): Promise<Actor> {
  const actor = await requireSignedIn();
  if (twoFactorRequired(actor.role) && !actor.twoFactorEnabled) redirect("/admin/seguridad?obligatorio=1");
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
