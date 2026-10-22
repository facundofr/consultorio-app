import { inject } from "vitest";

// Deterministic test keys (never used outside tests).
process.env.PII_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.PII_HASH_KEY ??= Buffer.alloc(32, 9).toString("base64");
process.env.APP_URL ??= "http://localhost:3000";

try {
  const url = inject("databaseUrl");
  if (url) process.env.DATABASE_URL = url;
} catch {
  // unit project: no database provided
}
process.env.DATABASE_URL ??= "postgres://unused@127.0.0.1:1/unused";
