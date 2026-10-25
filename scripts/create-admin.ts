/**
 * Create (or reset the password of) a panel user, for the first superadmin of
 * a production server — `pnpm seed` is blocked there.
 *
 *   pnpm create-admin --email ana@clinica.com --name "Ana Pérez"
 *   pnpm create-admin --email ana@clinica.com --name "Ana Pérez" --role clinic_admin --clinic mi-clinica
 *
 * Password: ADMIN_PASSWORD (10+ characters) or a random one printed once.
 * If the email already exists, only its password is replaced and its sessions closed.
 */
import "dotenv/config";
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { accounts, clinics, sessions, userRole, users, type UserRole } from "../src/db/schema";
import { hashPassword, PASSWORD_MIN_LENGTH } from "../src/server/auth/password";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name")?.trim();
  const role = (arg("role") ?? "superadmin") as UserRole;
  const clinicSlug = arg("clinic");
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Falta --email (ej. --email ana@clinica.com)');
  if (!userRole.enumValues.includes(role)) throw new Error(`--role tiene que ser uno de: ${userRole.enumValues.join(", ")}`);
  const given = process.env.ADMIN_PASSWORD;
  if (given && given.length < PASSWORD_MIN_LENGTH) throw new Error(`ADMIN_PASSWORD necesita al menos ${PASSWORD_MIN_LENGTH} caracteres.`);
  const password = given || randomBytes(12).toString("base64url");

  await runMigrations(url);
  const db = getDb();

  let clinicId: string | null = null;
  if (role !== "superadmin") {
    if (!clinicSlug) throw new Error("Para clinic_admin o staff indicá --clinic <slug de la clínica>.");
    const [c] = await db.select({ id: clinics.id }).from(clinics).where(eq(clinics.slug, clinicSlug));
    if (!c) throw new Error(`No existe la clínica «${clinicSlug}».`);
    clinicId = c.id;
  }

  const hash = await hashPassword(password);
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) {
    await db.update(accounts).set({ password: hash }).where(and(eq(accounts.userId, existing.id), eq(accounts.providerId, "credential")));
    await db.update(users).set({ active: true }).where(eq(users.id, existing.id));
    await db.delete(sessions).where(eq(sessions.userId, existing.id));
    console.log(`Usuario existente: se cambió la contraseña de ${email} y se cerraron sus sesiones.`);
  } else {
    if (!name) throw new Error('Falta --name (ej. --name "Ana Pérez")');
    const id = randomUUID();
    await db.insert(users).values({ id, name, email, role, clinicId, emailVerified: true, active: true });
    await db.insert(accounts).values({ id: randomUUID(), userId: id, accountId: id, providerId: "credential", password: hash });
    console.log(`Usuario creado: ${email} (${role}).`);
  }
  if (!given) console.log(`Contraseña (se muestra una sola vez, cambiala al ingresar): ${password}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
