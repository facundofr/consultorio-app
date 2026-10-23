import { describe, expect, it } from "vitest";
import { redactPersonalData } from "./redact";

describe("redactPersonalData", () => {
  it.each([
    ["mi cel es 11 5555-1234", "mi cel es [número]"],
    ["+54 9 11 5555 1234 llamame", "[número] llamame"],
    ["(011) 4555-1234", "[número]"],
    ["DNI 30.123.456", "DNI [número]"],
    ["escribime a juana.perez+turnos@example.com.ar", "escribime a [email]"],
  ])("%s", (input, expected) => {
    const r = redactPersonalData(input);
    expect(r.text).toBe(expected);
    expect(r.redacted).toBe(true);
  });

  it.each([
    "quiero un turno el 12/11 a las 10:30",
    "mi código es T-8KQ4ZP",
    "el 2026-11-12 a la mañana",
    "cuesta $35.000?",
    "tengo 3 hijos de 4, 7 y 10 años",
  ])("leaves %s alone", (input) => {
    expect(redactPersonalData(input)).toEqual({ text: input, redacted: false });
  });
});
