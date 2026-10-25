import { env } from "@/lib/env";

/**
 * Checked once when the server starts. Missing or malformed keys stop the
 * start (better than failing on the first booking); risky settings in
 * production are logged as warnings.
 */
export function checkStartupConfig(source: NodeJS.ProcessEnv = process.env): string[] {
  const e = env(); // throws with a readable list of what is missing
  const warnings: string[] = [];
  for (const k of ["PII_ENCRYPTION_KEY", "PII_HASH_KEY"] as const) {
    if (Buffer.from(e[k], "base64").length !== 32) throw new Error(`${k} must be 32 random bytes in base64 (openssl rand -base64 32).`);
  }
  if (e.NODE_ENV === "production") {
    if (!e.APP_URL.startsWith("https://")) warnings.push("APP_URL is not https: cookies are not marked Secure and HSTS is off.");
    if (!source.SMTP_HOST) warnings.push("SMTP_HOST is empty: emails are NOT sent, they stay in Panel → Emails (test inbox).");
    if (source.LLM_MOCK === "1" || source.LLM_MOCK === "true") warnings.push("LLM_MOCK is on: the assistant uses the scripted test model.");
    if (!source.TWO_FACTOR_REQUIRED_ROLES) warnings.push("TWO_FACTOR_REQUIRED_ROLES is empty: two-factor is optional for every role.");
  }
  for (const w of warnings) console.warn(`[startup] ${w}`);
  return warnings;
}
