import { hash, verify } from "@node-rs/argon2";

/** Argon2id with OWASP-recommended parameters (19 MiB, 2 iterations). */
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

export const PASSWORD_MIN_LENGTH = 10;
