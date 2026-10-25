/**
 * Two-factor authentication for the panel (TOTP authenticator app + backup codes).
 *
 * Sessions are created by Better Auth as usual; for users with two-factor on,
 * a session only counts once `sessions.two_factor_verified_at` is set by
 * `verifySessionCode`. Until then getActor() treats it as signed out and the
 * panel sends the user to /admin/login/verificar.
 */
import { and, eq, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { sessions, users, type UserRole } from "@/db/schema";
import { blindIndex, decrypt, encrypt } from "@/lib/pii";
import { generateBackupCodes, generateTotpSecret, normalizeBackupCode, totpUri, verifyTotp } from "@/lib/totp";
import { audit } from "@/server/admin/audit";
import { DomainError } from "@/server/errors";
import { rateLimit } from "@/server/security/rate-limit";
import { assertCan, type Actor } from "./rbac";

/** Roles that must use two-factor (TWO_FACTOR_REQUIRED_ROLES, comma separated). */
export function twoFactorRequired(role: UserRole, env: string | undefined = process.env.TWO_FACTOR_REQUIRED_ROLES): boolean {
  return (env ?? "")
    .split(",")
    .map((r) => r.trim())
    .includes(role);
}

const BAD_CODE = "El código no es correcto o ya se usó. Probá con el siguiente que muestre la app.";
const TOO_MANY = "Demasiados intentos. Esperá unos minutos y probá de nuevo.";

async function loadUser(db: Db, userId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u || !u.active) throw new DomainError("NOT_FOUND", "No encontramos tu usuario.");
  return u;
}

const hashBackup = (code: string) => blindIndex("backup", code);

/** Step 1 of setup: a new secret (stored encrypted, not active yet) and its QR URI. */
export async function beginTwoFactorSetup(db: Db, userId: string) {
  const u = await loadUser(db, userId);
  if (u.totpEnabledAt) throw new DomainError("VALIDATION", "El doble factor ya está activo.");
  const secret = generateTotpSecret();
  await db.update(users).set({ totpSecretEnc: encrypt(secret) }).where(eq(users.id, userId));
  return { secret, uri: totpUri(secret, u.email) };
}

/**
 * Step 2: the first code from the app proves it was set up right. Turns
 * two-factor on, marks the current session as verified and returns the
 * backup codes (shown once, only their hashes are kept).
 */
export async function confirmTwoFactorSetup(db: Db, userId: string, sessionId: string, code: string, now = new Date()) {
  if (!(await rateLimit(`2fa:${userId}`, 5, 15 * 60_000, { now })).ok) throw new DomainError("RATE_LIMITED", TOO_MANY);
  const u = await loadUser(db, userId);
  if (u.totpEnabledAt) throw new DomainError("VALIDATION", "El doble factor ya está activo.");
  if (!u.totpSecretEnc) throw new DomainError("VALIDATION", "Empezá la configuración de nuevo.");
  const step = verifyTotp(decrypt(u.totpSecretEnc), code, { now });
  if (step === null) throw new DomainError("VALIDATION", BAD_CODE);
  const codes = generateBackupCodes();
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ totpEnabledAt: now, totpLastStep: step, backupCodeHashes: codes.map((c) => hashBackup(normalizeBackupCode(c)!)) })
      .where(eq(users.id, userId));
    // This session just proved the second factor; others were opened with the password alone.
    await tx.update(sessions).set({ twoFactorVerifiedAt: now }).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
    await tx.delete(sessions).where(and(eq(sessions.userId, userId), ne(sessions.id, sessionId)));
    await audit(tx, { id: userId }, { action: "2fa.enabled", entity: "user", entityId: userId, clinicId: u.clinicId });
  });
  return codes;
}

/**
 * Login step 2: a 6-digit code or a backup code. On success the session
 * becomes valid. Backup codes are single use.
 */
export async function verifySessionCode(db: Db, userId: string, sessionId: string, code: string, now = new Date()) {
  if (!(await rateLimit(`2fa:${userId}`, 5, 15 * 60_000, { now })).ok) throw new DomainError("RATE_LIMITED", TOO_MANY);
  const u = await loadUser(db, userId);
  if (!u.totpEnabledAt || !u.totpSecretEnc) throw new DomainError("VALIDATION", "El doble factor no está activo.");

  let method: "totp" | "backup" | null = null;
  const step = verifyTotp(decrypt(u.totpSecretEnc), code, { now, lastStep: u.totpLastStep });
  if (step !== null) {
    // Conditional update: two requests with the same code cannot both pass.
    const [ok] = await db
      .update(users)
      .set({ totpLastStep: step })
      .where(and(eq(users.id, userId), u.totpLastStep == null ? undefined : eq(users.totpLastStep, u.totpLastStep)))
      .returning({ id: users.id });
    if (ok) method = "totp";
  } else {
    const backup = normalizeBackupCode(code);
    const hashes = u.backupCodeHashes ?? [];
    const h = backup ? hashBackup(backup) : null;
    if (h && hashes.includes(h)) {
      const [ok] = await db
        .update(users)
        .set({ backupCodeHashes: hashes.filter((x) => x !== h) })
        .where(and(eq(users.id, userId), eq(users.backupCodeHashes, hashes)))
        .returning({ id: users.id });
      if (ok) method = "backup";
    }
  }

  if (!method) {
    await audit(db, { id: userId }, { action: "login.2fa_failed", entity: "user", entityId: userId, clinicId: u.clinicId });
    throw new DomainError("VALIDATION", BAD_CODE);
  }
  const [s] = await db
    .update(sessions)
    .set({ twoFactorVerifiedAt: now })
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .returning({ id: sessions.id });
  if (!s) throw new DomainError("NOT_FOUND", "Tu sesión venció. Ingresá de nuevo.");
  await audit(db, { id: userId }, { action: "login.2fa", entity: "user", entityId: userId, clinicId: u.clinicId, data: { method } });
  return { method, backupCodesLeft: method === "backup" ? (u.backupCodeHashes?.length ?? 1) - 1 : (u.backupCodeHashes?.length ?? 0) };
}

/** New set of backup codes (the old ones stop working). Needs a current code. */
export async function regenerateBackupCodes(db: Db, actor: Actor, code: string, now = new Date()) {
  const u = await loadUser(db, actor.id);
  if (!u.totpEnabledAt || !u.totpSecretEnc) throw new DomainError("VALIDATION", "El doble factor no está activo.");
  if (!(await rateLimit(`2fa:${actor.id}`, 5, 15 * 60_000, { now })).ok) throw new DomainError("RATE_LIMITED", TOO_MANY);
  const step = verifyTotp(decrypt(u.totpSecretEnc), code, { now, lastStep: u.totpLastStep });
  if (step === null) throw new DomainError("VALIDATION", BAD_CODE);
  const codes = generateBackupCodes();
  await db.update(users).set({ totpLastStep: step, backupCodeHashes: codes.map((c) => hashBackup(normalizeBackupCode(c)!)) }).where(eq(users.id, actor.id));
  await audit(db, actor, { action: "2fa.backup_codes", entity: "user", entityId: actor.id, clinicId: u.clinicId });
  return codes;
}

/** Turn two-factor off for yourself (needs a current code; not allowed if your role requires it). */
export async function disableOwnTwoFactor(db: Db, actor: Actor, code: string, now = new Date()) {
  if (twoFactorRequired(actor.role)) throw new DomainError("FORBIDDEN", "Tu rol requiere doble factor: no se puede desactivar.");
  const u = await loadUser(db, actor.id);
  if (!u.totpEnabledAt || !u.totpSecretEnc) throw new DomainError("VALIDATION", "El doble factor no está activo.");
  if (!(await rateLimit(`2fa:${actor.id}`, 5, 15 * 60_000, { now })).ok) throw new DomainError("RATE_LIMITED", TOO_MANY);
  if (verifyTotp(decrypt(u.totpSecretEnc), code, { now, lastStep: u.totpLastStep }) === null) throw new DomainError("VALIDATION", BAD_CODE);
  await db.update(users).set({ totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null, backupCodeHashes: null }).where(eq(users.id, actor.id));
  await audit(db, actor, { action: "2fa.disabled", entity: "user", entityId: actor.id, clinicId: u.clinicId });
}

/**
 * An administrator removes someone's two-factor (lost phone). Their sessions
 * are closed; they set it up again on the next sign-in if their role requires it.
 */
export async function resetTwoFactor(db: Db, actor: Actor, targetUserId: string) {
  assertCan(actor, "write", "users");
  const [u] = await db.select().from(users).where(eq(users.id, targetUserId));
  if (!u) throw new DomainError("NOT_FOUND", "No encontramos ese usuario.");
  if (actor.role !== "superadmin" && (u.role === "superadmin" || u.clinicId !== actor.clinicId)) {
    throw new DomainError("FORBIDDEN", "No tenés permiso sobre ese usuario.");
  }
  if (u.id === actor.id) throw new DomainError("VALIDATION", "Para tu propio usuario usá «Mi cuenta».");
  await db.transaction(async (tx) => {
    await tx.update(users).set({ totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null, backupCodeHashes: null }).where(eq(users.id, u.id));
    await tx.delete(sessions).where(eq(sessions.userId, u.id));
    await audit(tx, actor, { action: "2fa.reset", entity: "user", entityId: u.id, clinicId: u.clinicId });
  });
}
