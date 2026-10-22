import { randomBytes, randomUUID } from "node:crypto";
import { asc } from "drizzle-orm";
import type { Db } from "./client";
import { accounts, clinics, users, type UserRole } from "./schema";
import { hashPassword } from "@/server/auth/password";

export type SeededUser = { email: string; role: UserRole; password: string };

/**
 * Demo admin users. Password: SEED_ADMIN_PASSWORD if set, otherwise a random
 * one printed once by `pnpm seed`.
 */
export async function seedAdminUsers(db: Db, password = process.env.SEED_ADMIN_PASSWORD): Promise<SeededUser[]> {
  const pwd = password && password.length >= 10 ? password : randomBytes(9).toString("base64url");
  const hash = await hashPassword(pwd);
  const cs = await db.select().from(clinics).orderBy(asc(clinics.name));
  const list: { name: string; email: string; role: UserRole; clinicId: string | null }[] = [
    { name: "Superadmin Demo", email: "superadmin@turnos.example", role: "superadmin", clinicId: null },
    ...cs.flatMap((c) => [
      { name: `Administración ${c.name}`, email: `admin@${c.slug}.example`, role: "clinic_admin" as const, clinicId: c.id },
      { name: `Recepción ${c.name}`, email: `recepcion@${c.slug}.example`, role: "staff" as const, clinicId: c.id },
    ]),
  ];
  for (const u of list) {
    const id = randomUUID();
    await db.insert(users).values({ id, ...u, emailVerified: true, active: true });
    await db.insert(accounts).values({ id: randomUUID(), userId: id, accountId: id, providerId: "credential", password: hash });
  }
  return list.map((u) => ({ email: u.email, role: u.role, password: pwd }));
}
