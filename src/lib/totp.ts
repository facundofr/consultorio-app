/**
 * Time-based one-time passwords (RFC 6238 / RFC 4226): the 6-digit codes of
 * Google Authenticator, Microsoft Authenticator, 1Password, Aegis…
 * HMAC-SHA1, 30-second steps, 6 digits — what every app expects.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_PERIOD = 30;
const DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("invalid base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160-bit secret, base32 (what the authenticator app stores). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpStep(now: Date = new Date()): number {
  return Math.floor(now.getTime() / 1000 / TOTP_PERIOD);
}

export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, "0");
}

/**
 * Check a code against the current step and one step either side (clock
 * drift). Returns the matching step, or null. Steps at or before `lastStep`
 * are rejected, so an intercepted code cannot be replayed.
 */
export function verifyTotp(secret: string, code: string, opts: { now?: Date; lastStep?: number | null } = {}): number | null {
  const digits = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(digits)) return null;
  const current = totpStep(opts.now);
  for (const step of [current - 1, current, current + 1]) {
    if (opts.lastStep != null && step <= opts.lastStep) continue;
    const expected = Buffer.from(totpCode(secret, step));
    const given = Buffer.from(digits);
    if (expected.length === given.length && timingSafeEqual(expected, given)) return step;
  }
  return null;
}

/** otpauth:// URI for the QR code. */
export function totpUri(secret: string, account: string, issuer = "Turnos IA"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(TOTP_PERIOD) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/* ------------------------------ Backup codes ------------------------------ */

const BACKUP_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** "K7QD-29XM": 8 symbols from an alphabet without look-alikes (~40 bits each). */
export function generateBackupCodes(n = 10): string[] {
  return Array.from({ length: n }, () => {
    const bytes = randomBytes(8);
    const s = Array.from(bytes, (b) => BACKUP_ALPHABET[b % BACKUP_ALPHABET.length]).join("");
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}

/** "k7qd 29xm" → "K7QD29XM" (null when it cannot be a backup code). */
export function normalizeBackupCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[^0-9A-Z]/g, "");
  return s.length === 8 ? s : null;
}
