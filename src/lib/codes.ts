import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** No 0/O, 1/I/L — easy to read aloud and type. 31 symbols. */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 6;

/** Short appointment code, e.g. "T-8KQ4ZP" (31^6 ≈ 887M combinations). */
export function generateAppointmentCode(): string {
  let s = "";
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `T-${s}`;
}

const CODE_RE = new RegExp(`^T-[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

/** Accepts "t-8kq4zp", "8KQ4ZP", " T 8KQ4ZP " → "T-8KQ4ZP" (or null if invalid). */
export function normalizeAppointmentCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = raw.startsWith("T") && raw.length === CODE_LENGTH + 1 ? raw.slice(1) : raw;
  const code = `T-${body}`;
  return CODE_RE.test(code) ? code : null;
}

/** Unguessable cancel token (256 bits). Only its hash is stored. */
export function generateCancelToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export function tokenMatches(token: string, storedHash: string): boolean {
  const a = Buffer.from(hashToken(token));
  const b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}
