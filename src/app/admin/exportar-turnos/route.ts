import { getDb } from "@/db/client";
import { exportAppointmentsCsv } from "@/server/admin/appointments";
import { getActiveClinicId, getActor } from "@/server/auth/session";
import { twoFactorRequired } from "@/server/auth/two-factor";
import { isDomainError } from "@/server/errors";

export const dynamic = "force-dynamic";

/** CSV export of the filtered appointment list (same filters as /admin/turnos). */
export async function GET(req: Request) {
  const actor = await getActor();
  if (!actor) return new Response("No autorizado", { status: 401 });
  if (twoFactorRequired(actor.role) && !actor.twoFactorEnabled) return new Response("Configurá el doble factor para exportar", { status: 403 });
  const clinicId = await getActiveClinicId(actor);
  if (!clinicId) return new Response("Sin clínica", { status: 400 });
  const sp = new URL(req.url).searchParams;
  const filters = {
    from: sp.get("desde") ?? undefined,
    to: sp.get("hasta") ?? undefined,
    professionalId: sp.get("profesional") ?? undefined,
    locationId: sp.get("sede") ?? undefined,
    status: sp.get("estado") ?? undefined,
    source: sp.get("origen") ?? undefined,
    q: sp.get("q") ?? undefined,
  };
  try {
    const csv = await exportAppointmentsCsv(getDb(), actor, clinicId, filters);
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="turnos-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (isDomainError(e) && e.code === "FORBIDDEN") return new Response("Sin permiso", { status: 403 });
    if (e && typeof e === "object" && "issues" in e) return new Response("Filtros inválidos", { status: 400 });
    throw e;
  }
}
