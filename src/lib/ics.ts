/**
 * Minimal RFC 5545 calendar file for one appointment ("Agregar al calendario").
 * Times are written in UTC so every calendar app shows the right local time.
 */
export type IcsEvent = {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  stamp?: Date;
  cancelled?: boolean;
};

function utc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escape text values (RFC 5545 §3.3.11). */
export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Fold lines longer than 75 octets (RFC 5545 §3.1), without splitting UTF-8 sequences. */
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  let limit = 75;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, "utf8");
    if (size + n > limit) {
      parts.push(current);
      current = "";
      size = 0;
      limit = 74; // continuation lines start with a space
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildIcs(ev: IcsEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Turnos IA//ES",
    "CALSCALE:GREGORIAN",
    `METHOD:${ev.cancelled ? "CANCEL" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${ev.uid}`,
    `DTSTAMP:${utc(ev.stamp ?? new Date())}`,
    `DTSTART:${utc(ev.start)}`,
    `DTEND:${utc(ev.end)}`,
    `SUMMARY:${escapeText(ev.summary)}`,
    ...(ev.description ? [`DESCRIPTION:${escapeText(ev.description)}`] : []),
    ...(ev.location ? [`LOCATION:${escapeText(ev.location)}`] : []),
    ...(ev.url ? [`URL:${ev.url}`] : []),
    `STATUS:${ev.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    ...(ev.cancelled
      ? []
      : ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Recordatorio de turno", "TRIGGER:-PT2H", "END:VALARM"]),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
