import { describe, expect, it } from "vitest";
import { formatMoney, likePattern, parseMoneyToCents, slugify } from "./common";

describe("admin common helpers", () => {
  it("slugify", () => expect(slugify("Clínica Médica  General!")).toBe("clinica-medica-general"));
  it.each([
    ["", null],
    ["35000", 3_500_000],
    ["35.000", 3_500_000],
    ["$ 35.000,50", 3_500_050],
    ["1234.5", 123_450],
  ])("parseMoneyToCents(%s)", (i, o) => expect(parseMoneyToCents(i)).toBe(o));
  it("rejects negative money", () => expect(() => parseMoneyToCents("-1")).toThrow());
  it("formats ARS", () => expect(formatMoney(3_500_000).replace(/\s/g, " ")).toMatch(/\$\s?35\.000/));
  it("escapes LIKE wildcards", () => expect(likePattern("50%_a")).toBe("%50\\%\\_a%"));
});
