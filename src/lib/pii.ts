import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

/**
 * Personal data protection helpers.
 *
 * - encrypt/decrypt: AES-256-GCM with PII_ENCRYPTION_KEY. Format: v1.<iv>.<tag>.<ciphertext> (base64url).
 * - blindIndex: HMAC-SHA256 with PII_HASH_KEY, for exact-match lookups without decrypting.
 *
 * Losing PII_ENCRYPTION_KEY makes stored phones/emails unreadable: back it up
 * separately from database dumps.
 */

function key(name: "PII_ENCRYPTION_KEY" | "PII_HASH_KEY"): Buffer {
  const raw = process.env[name];
  if (!raw) throw new Error(`${name} is not set`);
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error(`${name} must be 32 bytes, base64-encoded`);
  return buf;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("PII_ENCRYPTION_KEY"), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(payload: string): string {
  const [v, iv, tag, ct] = payload.split(".");
  if (v !== "v1" || !iv || !tag || ct === undefined) throw new Error("Invalid encrypted payload");
  const decipher = createDecipheriv("aes-256-gcm", key("PII_ENCRYPTION_KEY"), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

export function blindIndex(kind: "phone" | "email" | "ip" | "ratelimit" | "backup", normalized: string): string {
  return createHmac("sha256", key("PII_HASH_KEY")).update(`${kind}:${normalized}`).digest("base64url");
}

/* ------------------------------ normalizers ------------------------------ */

/**
 * Canonical Argentine phone: 10 digits (area code + local number), without
 * country code, trunk "0", mobile "9" or the "15" mobile prefix.
 * Non-Argentine or odd numbers fall back to their digits.
 *
 *   "+54 9 11 1234-5678" → "1112345678"
 *   "011 15 1234-5678"   → "1112345678"
 *   "(0294) 15-4123456"  → "2944123456"
 */
export function normalizePhone(input: string): string {
  let d = input.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("54") && d.length >= 12) {
    d = d.slice(2);
    if (d.startsWith("9") && d.length === 11) d = d.slice(1);
  }
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 12) {
    // Area code (2-4 digits) followed by the "15" mobile prefix.
    for (const areaLen of [2, 3, 4]) {
      if (d.slice(areaLen, areaLen + 2) === "15") {
        d = d.slice(0, areaLen) + d.slice(areaLen + 2);
        break;
      }
    }
  }
  return d;
}

export function isPlausiblePhone(input: string): boolean {
  const d = normalizePhone(input);
  return d.length >= 8 && d.length <= 13;
}

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

/** Lowercase, no accents, single spaces — used to tell family members apart. */
export function normalizeName(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Display-safe masked phone, e.g. "••• ••• 5678". */
export function maskPhoneLast4(last4: string): string {
  return `••• ••• ${last4}`;
}
