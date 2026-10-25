/**
 * Appointment emails: pure functions, no I/O.
 *
 * HTML built with tables and inline styles (Gmail, Outlook, Apple Mail),
 * 600 px wide, plus a plain-text version. Colours follow the app (eucalyptus
 * and the yellow "sol" box for the date) and are chosen so that clients that
 * invert colours in dark mode keep enough contrast. Every dynamic value is
 * escaped.
 */
import type { EmailKind } from "@/db/schema";

export type AppointmentEmailData = {
  kind: EmailKind;
  clinic: { name: string; phone: string | null; email: string | null };
  patientFirstName: string;
  code: string;
  /** "jueves 5 de noviembre, 10:30 h" */
  when: string;
  /** "jue 5/11, 10:30 h" — for the subject */
  shortWhen: string;
  /** Previous time, for "rescheduled". */
  previousWhen?: string | null;
  professional: string;
  specialty: string | null;
  service: string;
  location: { name: string; address: string; city: string | null; notes: string | null };
  /** View or cancel (with the link token when we have it). */
  manageUrl: string;
  /** "Sacar otro turno" (cancellation). */
  rebookUrl?: string | null;
  cancelledBy?: "patient" | "clinic";
  /** Cancellation rule, e.g. "hasta el miércoles 4 de noviembre, 10:30 h". */
  cancelDeadline?: string | null;
  canStillCancel?: boolean;
  privacyUrl: string;
};

export type RenderedEmail = { subject: string; html: string; text: string };

const C = {
  ink: "#17262e",
  paper: "#f5f7f6",
  primary: "#0f5c53",
  primaryLight: "#e3efec",
  sun: "#fdf3d8",
  sunBorder: "#f0b429",
  grey: "#56656c",
  line: "#d5dedb",
  alert: "#a8321f",
};
const FONT = "'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible', Verdana, Arial, sans-serif";

export function escapeHtml(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function headline(d: AppointmentEmailData): { subject: string; title: string; intro: string } {
  const who = d.professional;
  switch (d.kind) {
    case "confirmation":
      return {
        subject: `Turno confirmado: ${d.shortWhen} · ${who}`,
        title: `¡Listo, ${d.patientFirstName}! Tu turno está confirmado`,
        intro: "Te esperamos. Guardá este email: tiene el enlace para ver o cancelar el turno.",
      };
    case "cancellation":
      return {
        subject: `Turno cancelado: ${d.shortWhen} · ${who}`,
        title: d.cancelledBy === "clinic" ? `${d.patientFirstName}, la clínica canceló tu turno` : `${d.patientFirstName}, cancelaste tu turno`,
        intro:
          d.cancelledBy === "clinic"
            ? "Lamentamos el cambio. Si querés, podés sacar otro turno cuando te quede cómodo."
            : "El horario quedó libre. Si querés, podés sacar otro turno cuando te quede cómodo.",
      };
    case "rescheduled":
      return {
        subject: `Tu turno cambió: ${d.shortWhen} · ${who}`,
        title: `${d.patientFirstName}, tu turno cambió de horario`,
        intro: "La clínica movió tu turno. Estos son los datos nuevos.",
      };
    case "reminder":
      return {
        subject: `Recordatorio: tu turno es el ${d.shortWhen}`,
        title: `${d.patientFirstName}, te recordamos tu turno`,
        intro: "Te esperamos. Llegá 10 minutos antes con tu DNI.",
      };
  }
}

function addressLine(d: AppointmentEmailData) {
  return [d.location.address, d.location.city].filter(Boolean).join(", ");
}

function cancelHint(d: AppointmentEmailData): string | null {
  if (d.kind === "cancellation") return null;
  if (d.canStillCancel && d.cancelDeadline) return `Podés cancelarlo online ${d.cancelDeadline}.`;
  if (d.kind === "reminder" && !d.canStillCancel) {
    return `Ya no se puede cancelar online.${d.clinic.phone ? ` Si no podés ir, llamá al ${d.clinic.phone}.` : ""}`;
  }
  return null;
}

export function renderAppointmentEmail(d: AppointmentEmailData): RenderedEmail {
  const h = headline(d);
  const e = escapeHtml;
  const hint = cancelHint(d);
  const cancelled = d.kind === "cancellation";
  const button =
    d.kind === "cancellation"
      ? d.rebookUrl
        ? { href: d.rebookUrl, label: "Sacar otro turno" }
        : null
      : { href: d.manageUrl, label: d.kind === "reminder" && d.canStillCancel ? "¿No podés ir? Cancelalo" : "Ver o cancelar mi turno" };

  const rows: [string, string][] = [
    ["Profesional", d.professional],
    ...(d.specialty ? ([["Especialidad", d.specialty]] as [string, string][]) : []),
    ["Consulta", d.service],
    ["Sede", d.location.name],
    ["Dirección", addressLine(d)],
    ...(d.location.notes ? ([["Indicaciones", d.location.notes]] as [string, string][]) : []),
    ["Código", d.code],
  ];

  const detailRows = rows
    .map(
      ([k, v]) => `<tr>
  <td style="padding:6px 0;color:${C.grey};font-size:14px;width:120px;vertical-align:top;">${e(k)}</td>
  <td style="padding:6px 0;color:${C.ink};font-size:15px;font-weight:600;">${e(v)}</td>
</tr>`,
    )
    .join("\n");

  const previous = d.previousWhen
    ? `<p style="margin:0 0 6px;font-size:14px;color:${C.grey};">Antes: <span style="text-decoration:line-through;">${e(d.previousWhen)}</span></p>`
    : "";

  const html = `<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${e(h.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.paper};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${C.line};border-radius:12px;font-family:${FONT};color:${C.ink};">
<tr><td style="background:${C.primary};border-radius:12px 12px 0 0;padding:18px 28px;color:#ffffff;font-size:18px;font-weight:700;">${e(d.clinic.name)}</td></tr>
<tr><td style="padding:28px;">
<h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;color:${C.ink};">${e(h.title)}</h1>
<p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:${C.ink};">${e(h.intro)}</p>
${previous}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
<tr><td style="background:${cancelled ? C.primaryLight : C.sun};border-left:6px solid ${cancelled ? C.grey : C.sunBorder};border-radius:8px;padding:16px 18px;font-size:20px;font-weight:700;color:${C.ink};${cancelled ? "text-decoration:line-through;" : ""}">${e(d.when)}</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
${detailRows}
</table>
${
  button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr><td style="background:${C.primary};border-radius:8px;">
<a href="${e(button.href)}" style="display:inline-block;padding:14px 22px;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;">${e(button.label)}</a>
</td></tr></table>`
    : ""
}
${hint ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:${C.grey};">${e(hint)}</p>` : ""}
${d.kind === "confirmation" || d.kind === "rescheduled" ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:${C.grey};">Adjuntamos el archivo para agregarlo a tu calendario.</p>` : ""}
</td></tr>
<tr><td style="border-top:1px solid ${C.line};padding:18px 28px;font-size:13px;line-height:1.5;color:${C.grey};">
${e(d.clinic.name)}${d.clinic.phone ? ` · Tel. ${e(d.clinic.phone)}` : ""}${d.clinic.email ? ` · ${e(d.clinic.email)}` : ""}<br>
Recibís este email porque reservaste un turno. No lo respondas: para consultas, comunicate con la clínica.
<a href="${e(d.privacyUrl)}" style="color:${C.primary};">Política de privacidad</a>.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    d.clinic.name,
    "",
    h.title,
    h.intro,
    "",
    ...(d.previousWhen ? [`Antes: ${d.previousWhen}`] : []),
    `${cancelled ? "Turno cancelado" : "Cuándo"}: ${d.when}`,
    ...rows.map(([k, v]) => `${k}: ${v}`),
    "",
    ...(button ? [`${button.label}: ${button.href}`, ""] : []),
    ...(hint ? [hint, ""] : []),
    [d.clinic.name, d.clinic.phone ? `Tel. ${d.clinic.phone}` : null, d.clinic.email].filter(Boolean).join(" · "),
    `Política de privacidad: ${d.privacyUrl}`,
  ].join("\n");

  return { subject: h.subject, html, text };
}
