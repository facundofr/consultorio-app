"use server";

import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { audit } from "@/server/admin/audit";
import { getAuth } from "@/server/auth/auth";
import { ACTIVE_CLINIC_COOKIE, getPendingTwoFactor, requireActor } from "@/server/auth/session";
import { verifySessionCode } from "@/server/auth/two-factor";
import { isDomainError } from "@/server/errors";
import { rateLimit } from "@/server/security/rate-limit";
import { clientIpHash } from "@/server/security/request";
import { listClinics } from "@/server/admin/clinics";

export type LoginState = { error?: string; email?: string };

const LoginInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
  next: z.string().optional(),
});

function safeNext(next: string | undefined) {
  return next && next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin";
}

export async function loginAction(_: LoginState, fd: FormData): Promise<LoginState> {
  const parsed = LoginInput.safeParse({ email: fd.get("email"), password: fd.get("password"), next: fd.get("next") || undefined });
  const email = String(fd.get("email") ?? "");
  if (!parsed.success) return { error: "Ingresá tu email y tu contraseña.", email };

  const ip = await clientIpHash();
  const byIp = await rateLimit(`login:ip:${ip}`, 20, 15 * 60_000);
  const byEmail = await rateLimit(`login:email:${parsed.data.email}`, 5, 15 * 60_000);
  if (!byIp.ok || !byEmail.ok) {
    const mins = Math.ceil(Math.max(byIp.retryAfterSeconds, byEmail.retryAfterSeconds) / 60);
    return { error: `Demasiados intentos. Probá de nuevo en ${mins} minuto${mins === 1 ? "" : "s"}.`, email };
  }

  let needsCode = false;
  try {
    const res = await getAuth().api.signInEmail({
      body: { email: parsed.data.email, password: parsed.data.password },
      headers: await headers(),
    });
    const [u] = await getDb().select({ totpEnabledAt: users.totpEnabledAt, clinicId: users.clinicId }).from(users).where(eq(users.id, res.user.id));
    needsCode = !!u?.totpEnabledAt;
    await audit(getDb(), { id: res.user.id }, { action: "login", entity: "user", entityId: res.user.id, clinicId: u?.clinicId ?? null, data: { twoFactorPending: needsCode } });
  } catch {
    // No email in the log: only which account (if it exists) got a wrong password.
    const [u] = await getDb().select({ id: users.id, clinicId: users.clinicId }).from(users).where(eq(users.email, parsed.data.email));
    await audit(getDb(), null, { action: "login_failed", entity: "user", entityId: u?.id ?? null, clinicId: u?.clinicId ?? null });
    return { error: "El email o la contraseña no son correctos.", email };
  }
  const next = safeNext(parsed.data.next);
  if (needsCode) redirect(`/admin/login/verificar?next=${encodeURIComponent(next)}`);
  redirect(next);
}

export type VerifyState = { error?: string };

/** Login step 2: 6-digit code from the authenticator app, or a backup code. */
export async function verifyTwoFactorAction(_: VerifyState, fd: FormData): Promise<VerifyState> {
  const pending = await getPendingTwoFactor();
  if (!pending) redirect("/admin/login");
  const code = String(fd.get("code") ?? "").slice(0, 20);
  if (!code.trim()) return { error: "Ingresá el código." };
  try {
    await verifySessionCode(getDb(), pending.userId, pending.sessionId, code);
  } catch (e) {
    if (isDomainError(e)) return { error: e.userMessage };
    throw e;
  }
  redirect(safeNext(String(fd.get("next") ?? "") || undefined));
}

export async function logoutAction() {
  try {
    await getAuth().api.signOut({ headers: await headers() });
  } catch {
    // session already gone
  }
  redirect("/admin/login");
}

export async function switchClinicAction(fd: FormData) {
  const actor = await requireActor();
  if (actor.role !== "superadmin") return;
  const id = String(fd.get("clinicId") ?? "");
  const list = await listClinics(getDb(), actor);
  if (!list.some((c) => c.id === id)) return;
  (await cookies()).set(ACTIVE_CLINIC_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/admin", secure: process.env.APP_URL?.startsWith("https://") });
  redirect("/admin");
}
