import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateBackupCodes, generateTotpSecret, normalizeBackupCode, totpCode, totpStep, totpUri, verifyTotp } from "./totp";

// RFC 6238 Appendix B: SHA1 secret "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("totp", () => {
  it("matches the RFC 6238 test vectors (last 6 digits)", () => {
    const at = (s: number) => totpCode(RFC_SECRET, Math.floor(s / 30));
    expect(at(59)).toBe("287082");
    expect(at(1111111109)).toBe("081804");
    expect(at(1111111111)).toBe("050471");
    expect(at(1234567890)).toBe("005924");
    expect(at(2000000000)).toBe("279037");
  });

  it("base32 round-trips", () => {
    const buf = Buffer.from([0, 1, 2, 250, 251, 255, 17]);
    expect(base32Decode(base32Encode(buf))).toEqual(buf);
    expect(generateTotpSecret()).toMatch(/^[A-Z2-7]{32}$/);
  });

  it("accepts the current code and one step of drift, nothing more", () => {
    const secret = generateTotpSecret();
    const now = new Date("2026-10-25T12:00:10Z");
    const step = totpStep(now);
    expect(verifyTotp(secret, totpCode(secret, step), { now })).toBe(step);
    expect(verifyTotp(secret, totpCode(secret, step - 1), { now })).toBe(step - 1);
    expect(verifyTotp(secret, totpCode(secret, step + 1), { now })).toBe(step + 1);
    expect(verifyTotp(secret, totpCode(secret, step - 2), { now })).toBeNull();
    expect(verifyTotp(secret, "12345", { now })).toBeNull();
    expect(verifyTotp(secret, "abcdef", { now })).toBeNull();
  });

  it("never accepts the same code twice", () => {
    const secret = generateTotpSecret();
    const now = new Date("2026-10-25T12:00:10Z");
    const code = totpCode(secret, totpStep(now));
    const used = verifyTotp(secret, code, { now })!;
    expect(verifyTotp(secret, code, { now, lastStep: used })).toBeNull();
  });

  it("builds the otpauth URI", () => {
    expect(totpUri("ABC", "ana@clinica.com")).toBe(
      "otpauth://totp/Turnos%20IA%3Aana%40clinica.com?secret=ABC&issuer=Turnos+IA&algorithm=SHA1&digits=6&period=30",
    );
  });

  it("backup codes are readable and normalized", () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    expect(normalizeBackupCode(" k7qd 29xm ")).toBe("K7QD29XM");
    expect(normalizeBackupCode("123456")).toBeNull();
  });
});
