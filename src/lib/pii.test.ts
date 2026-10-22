import { describe, expect, it } from "vitest";
import { generateAppointmentCode, generateCancelToken, hashToken, normalizeAppointmentCode, tokenMatches } from "./codes";
import { blindIndex, decrypt, encrypt, normalizeEmail, normalizeName, normalizePhone } from "./pii";

describe("phone normalization (AR)", () => {
  it.each([
    ["+54 9 11 1234-5678", "1112345678"],
    ["5491112345678", "1112345678"],
    ["011 15 1234-5678", "1112345678"],
    ["11 1234 5678", "1112345678"],
    ["(0294) 15-4123456", "2944123456"],
    ["0351 155 123456", "3515123456"],
    ["0054 9 261 412-3456", "2614123456"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});

describe("other normalizers", () => {
  it("emails", () => expect(normalizeEmail("  Ana.Perez@Mail.COM ")).toBe("ana.perez@mail.com"));
  it("names", () => expect(normalizeName("  María  José   Núñez-Pérez ")).toBe("maria jose nunez perez"));
});

describe("encryption", () => {
  it("round-trips and uses a random IV", () => {
    const a = encrypt("1112345678");
    const b = encrypt("1112345678");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("1112345678");
  });

  it("detects tampering", () => {
    const enc = encrypt("secret");
    const parts = enc.split(".");
    parts[3] = Buffer.from("other").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
  });

  it("blind index is deterministic and kind-scoped", () => {
    expect(blindIndex("phone", "1112345678")).toBe(blindIndex("phone", "1112345678"));
    expect(blindIndex("phone", "x")).not.toBe(blindIndex("email", "x"));
  });
});

describe("appointment codes and tokens", () => {
  it("generates valid, normalizable codes", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateAppointmentCode();
      expect(code).toMatch(/^T-[2-9A-HJKMNP-Z]{6}$/);
      expect(normalizeAppointmentCode(code.toLowerCase())).toBe(code);
      expect(normalizeAppointmentCode(code.slice(2))).toBe(code);
    }
  });

  it("rejects malformed codes", () => {
    expect(normalizeAppointmentCode("T-0000")).toBeNull();
    expect(normalizeAppointmentCode("T-ABCDE1")).toBeNull(); // '1' is not in the alphabet
    expect(normalizeAppointmentCode("")).toBeNull();
  });

  it("tokens are long, random and verified by hash", () => {
    const t = generateCancelToken();
    expect(t.length).toBeGreaterThanOrEqual(43);
    expect(generateCancelToken()).not.toBe(t);
    expect(tokenMatches(t, hashToken(t))).toBe(true);
    expect(tokenMatches(t + "x", hashToken(t))).toBe(false);
  });
});
