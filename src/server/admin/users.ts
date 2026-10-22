import { randomUUID } from "node:crypto";
import { and, asc, eq, ilike, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { accounts, clinics, sessions, users, userRole } from "@/db/schema";
import { hashPassword, PASSWORD_MIN_LENGTH } from "@/server/auth/password";
import { assertCan, assignableRoles, type Actor } from "@/server/auth/rbac";
import { DomainError, PG_UNIQUE_VIOLATION, pgErrorCode } from "@/server/errors";
import { audit } from "./audit";
import { boolFromForm, likePattern, requiredText } from "./common";

const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `La contraseña necesita al menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  .max(128);

export const UserInput = z.object({
  name: requiredText("el nombre", 120),
  email: z.string().trim().toLowerCase().email("Email inválido."),
  role: z.enum(userRole.enumValues),
  clinicId: z
    .string()
    .optional()
    .nullable()
    .transform((v) => v || null)
    .pipe(z.string().uuid().nullable()),
  active: boolFromForm,
  password: z
    .string()
    .optional()
    .transform((v) => v || undefined)
    .pipe(password.optional()),
});
export type UserInput = z.input<typeof UserInput>;

export type UserListItem = Omit<typeof users.$inferSelect, "image" | "emailVerified"> & { clinicName: string | null };

function scopeCheck(actor: Actor, target: { role: string; clinicId: string | null }) {
  if (actor.role === "superadmin") return;
  if (target.role === "superadmin" || target.clinicId !== actor.clinicId) {
    throw new DomainError("FORBIDDEN", "No tenés permiso sobre ese usuario.");
  }
}

export async function listUsers(db: Db, actor: Actor, opts: { q?: string } = {}): Promise<UserListItem[]> {
  assertCan(actor, "read", "users");
  const conds: SQL[] = [];
  if (actor.role !== "superadmin") conds.push(eq(users.clinicId, actor.clinicId!));
  if (opts.q) conds.push(or(ilike(users.name, likePattern(opts.q)), ilike(users.email, likePattern(opts.q)))!);
  return db
    .select({
      id: users.id, name: users.name, email: users.email, role: users.role, clinicId: users.clinicId,
      active: users.active, createdAt: users.createdAt, updatedAt: users.updatedAt, clinicName: clinics.name,
    })
    .from(users)
    .leftJoin(clinics, eq(clinics.id, users.clinicId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(users.name));
}

export async function getUser(db: Db, actor: Actor, id: string) {
  assertCan(actor, "read", "users");
  const [u] = await db.select().from(users).where(eq(users.id, id));
  if (!u) throw new DomainError("NOT_FOUND", "No encontramos ese usuario.");
  scopeCheck(actor, u);
  return u;
}

export async function saveUser(db: Db, actor: Actor, raw: UserInput, id?: string) {
  assertCan(actor, "write", "users");
  const input = UserInput.parse(raw);
  if (!assignableRoles(actor).includes(input.role)) throw new DomainError("FORBIDDEN", "No podés asignar ese rol.");
  const clinicId = input.role === "superadmin" ? null : actor.role === "superadmin" ? input.clinicId : actor.clinicId;
  if (input.role !== "superadmin" && !clinicId) throw new DomainError("VALIDATION", "Elegí la clínica del usuario.");
  if (id === actor.id && (input.role !== actor.role || !input.active)) {
    throw new DomainError("VALIDATION", "No podés cambiar tu propio rol ni desactivarte.");
  }

  try {
    return await db.transaction(async (tx) => {
      if (id) {
        const [before] = await tx.select().from(users).where(eq(users.id, id));
        if (!before) throw new DomainError("NOT_FOUND", "No encontramos ese usuario.");
        scopeCheck(actor, before);
        await tx.update(users).set({ name: input.name, email: input.email, role: input.role, clinicId, active: input.active }).where(eq(users.id, id));
        if (input.password) {
          await tx.update(accounts).set({ password: await hashPassword(input.password) }).where(and(eq(accounts.userId, id), eq(accounts.providerId, "credential")));
        }
        // Role/clinic/active/password changes take effect immediately.
        if (input.password || !input.active || before.role !== input.role || before.clinicId !== clinicId) {
          await tx.delete(sessions).where(eq(sessions.userId, id));
        }
        await audit(tx, actor, { action: "update", entity: "user", entityId: id, clinicId, data: { role: input.role, active: input.active, passwordChanged: !!input.password } });
        return id;
      }
      if (!input.password) throw new DomainError("VALIDATION", "Definí una contraseña inicial.");
      const newId = randomUUID();
      await tx.insert(users).values({ id: newId, name: input.name, email: input.email, role: input.role, clinicId, active: input.active, emailVerified: true });
      await tx.insert(accounts).values({ id: randomUUID(), userId: newId, accountId: newId, providerId: "credential", password: await hashPassword(input.password) });
      await audit(tx, actor, { action: "create", entity: "user", entityId: newId, clinicId, data: { role: input.role } });
      return newId;
    });
  } catch (e) {
    if (pgErrorCode(e) === PG_UNIQUE_VIOLATION) throw new DomainError("VALIDATION", "Ya existe un usuario con ese email.");
    throw e;
  }
}
