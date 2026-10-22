import { getDb } from "@/db/client";
import { buildIcs } from "@/lib/ics";
import { findAppointmentPublic } from "@/server/booking/public";
import { isDomainError } from "@/server/errors";

export const dynamic = "force-dynamic";

/** "Agregar al calendario": .ics for the appointment (requires the link token). */
export async function GET(req: Request, ctx: RouteContext<"/turno/[code]/calendario">) {
  const { code } = await ctx.params;
  const token = new URL(req.url).searchParams.get("t");
  if (!token) return new Response("Falta el enlace del turno.", { status: 400 });
  try {
    const v = await findAppointmentPublic(getDb(), code, { token });
    const appUrl = process.env.APP_URL ?? new URL(req.url).origin;
    const ics = buildIcs({
      uid: `${v.code}@${new URL(appUrl).host}`,
      start: v.startsAt,
      end: v.endsAt,
      summary: `Turno: ${v.specialtyName ?? v.serviceName}, ${v.professionalName}`,
      description: `Código ${v.code}. ${v.serviceName}. Llegá 10 minutos antes con tu DNI.${v.clinic.phone ? ` Clínica: ${v.clinic.phone}.` : ""}`,
      location: `${v.location.name}, ${v.location.address}`,
      url: `${appUrl}/turno/${v.code}`,
      cancelled: v.status.startsWith("cancelled"),
    });
    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="turno-${v.code}.ics"`,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (e) {
    if (isDomainError(e)) return new Response("No encontramos ese turno.", { status: 404 });
    throw e;
  }
}
