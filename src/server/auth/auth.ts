import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { getDb, type Db } from "@/db/client";
import { accounts, sessions, users, verifications } from "@/db/schema";
import { hashPassword, PASSWORD_MIN_LENGTH, verifyPassword } from "./password";

const SESSION_HOURS = 12;

function createAuth(db: Db) {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  return betterAuth({
    appName: "Turnos IA",
    baseURL: appUrl,
    basePath: "/api/auth",
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: [appUrl],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    emailAndPassword: {
      enabled: true,
      // Admin users are created by other admins from /admin/usuarios.
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: 128,
      password: {
        hash: hashPassword,
        verify: ({ hash, password }) => verifyPassword(hash, password),
      },
    },
    user: {
      additionalFields: {
        role: { type: "string", input: false, required: true, defaultValue: "staff" },
        clinicId: { type: "string", input: false, required: false },
        active: { type: "boolean", input: false, required: true, defaultValue: true },
      },
    },
    session: {
      expiresIn: SESSION_HOURS * 3600,
      updateAge: 3600,
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 60,
      customRules: { "/sign-in/email": { window: 300, max: 10 } },
    },
    advanced: {
      cookiePrefix: "turnos",
      useSecureCookies: appUrl.startsWith("https://"),
    },
    databaseHooks: {
      session: {
        create: {
          // Deactivated users cannot open new sessions.
          before: async (session) => {
            const [u] = await db.select({ active: users.active }).from(users).where(eq(users.id, session.userId)).limit(1);
            if (!u?.active) return false;
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
const g = globalThis as unknown as { __turnosAuth?: Auth };

export function getAuth(): Auth {
  if (!g.__turnosAuth) g.__turnosAuth = createAuth(getDb());
  return g.__turnosAuth;
}
