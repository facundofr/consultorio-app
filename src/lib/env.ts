import { z } from "zod";

const boolish = z
  .enum(["true", "false", "1", "0"])
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_TIMEZONE: z.string().default("America/Argentina/Buenos_Aires"),

  // 32-byte keys, base64. Generate with: openssl rand -base64 32
  PII_ENCRYPTION_KEY: z.string().min(40),
  PII_HASH_KEY: z.string().min(40),

  BETTER_AUTH_SECRET: z.string().min(32),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Parsed, validated environment. Throws with a readable message if invalid. */
export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** For tests only: drop the cached env so a new process.env is picked up. */
export function resetEnvCache() {
  cached = undefined;
}

export { boolish };
