import { describe, expect, it } from "vitest";
import { buildIcs, escapeText, foldLine } from "./ics";

describe("ics", () => {
  const ics = buildIcs({
    uid: "T-8KQ4ZP@turnos.example",
    start: new Date("2026-11-05T17:30:00Z"),
    end: new Date("2026-11-05T18:00:00Z"),
    stamp: new Date("2026-10-22T12:00:00Z"),
    summary: "Turno: Consulta, Dra. Lucía Ferrante",
    description: "Código T-8KQ4ZP\nTraé tu DNI; llegá 10 min antes, gracias",
    location: "Sede Centro, Av. Inventada 1234, CABA",
    url: "https://recepcion.example/turno/T-8KQ4ZP",
  });

  it("is a valid calendar with CRLF line endings", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
  });

  it("writes UTC times", () => {
    expect(ics).toContain("DTSTART:20261105T173000Z");
    expect(ics).toContain("DTEND:20261105T180000Z");
    expect(ics).toContain("DTSTAMP:20261022T120000Z");
  });

  it("escapes text", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\;c\\\\d\\ne");
    expect(ics.replace(/\r\n /g, "")).toContain("DESCRIPTION:Código T-8KQ4ZP\\nTraé tu DNI\; llegá 10 min antes\\, gracias");
  });

  it("folds long lines without breaking multi-byte characters", () => {
    const long = "SUMMARY:" + "ñ".repeat(60);
    const folded = foldLine(long);
    expect(folded.split("\r\n").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe(long);
  });

  it("marks cancelled events", () => {
    const c = buildIcs({ uid: "x", start: new Date(0), end: new Date(1000), summary: "x", cancelled: true });
    expect(c).toContain("METHOD:CANCEL");
    expect(c).toContain("STATUS:CANCELLED");
    expect(c).not.toContain("VALARM");
  });
});
