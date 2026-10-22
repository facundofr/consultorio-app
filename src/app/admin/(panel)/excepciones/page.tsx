import type { Metadata } from "next";
import { ExceptionForm } from "@/components/admin/exception-form";
import { ExceptionList } from "@/components/admin/exception-list";
import { PageHeader } from "@/components/admin/page-header";
import { NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { listLocations } from "@/server/admin/catalog";
import { listExceptions } from "@/server/admin/exceptions";
import { listProfessionals, professionalDisplayName } from "@/server/admin/professionals";
import { can } from "@/server/auth/rbac";
import { getClinicContext } from "@/server/clinics/settings";
import { createExceptionAction, deleteExceptionAction } from "../../_actions/professionals";
import { serverNow } from "@/lib/clock";
import { adminContext, param } from "../../_lib/context";

export const metadata: Metadata = { title: "Feriados y bloqueos" };

export default async function ExceptionsPage({ searchParams }: PageProps<"/admin/excepciones">) {
  const { db, actor, clinicId } = await adminContext();
  const sp = await searchParams;
  const scope = param(sp, "alcance") as "clinic" | "location" | "professional" | undefined;
  const past = param(sp, "pasados") === "1";
  const { clinic } = await getClinicContext(db, clinicId);
  const [rows, locs, profs] = await Promise.all([
    listExceptions(db, actor, clinicId, { scope, from: past ? new Date(serverNow().getTime() - 365 * 86_400_000) : serverNow() }),
    listLocations(db, actor, clinicId),
    listProfessionals(db, actor, clinicId),
  ]);
  const canWrite = can(actor, "write", "schedules");
  return (
    <>
      <PageHeader title="Feriados y bloqueos" description="Días u horarios en que no se atiende, y horarios extra. Se descuentan solos de la disponibilidad." />
      <div className="grid gap-10 xl:grid-cols-[1fr_28rem]">
        <section className="flex flex-col gap-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="alcance">Alcance</Label>
              <NativeSelect id="alcance" name="alcance" defaultValue={scope ?? ""} className="w-52">
                <option value="">Todos</option>
                <option value="clinic">Feriados de la clínica</option>
                <option value="location">Cierres de sede</option>
                <option value="professional">Profesionales</option>
              </NativeSelect>
            </div>
            <label className="flex h-10 items-center gap-2 text-sm">
              <input type="checkbox" name="pasados" value="1" defaultChecked={past} className="size-4 accent-[var(--eucalipto)]" /> Incluir el último año
            </label>
            <Button type="submit" variant="outline">Filtrar</Button>
          </form>
          <ExceptionList
            tz={clinic.timezone}
            canDelete={canWrite}
            deleteAction={deleteExceptionAction}
            items={rows.map((r) => ({
              ...r.exception,
              where:
                r.exception.scope === "clinic"
                  ? "Toda la clínica"
                  : r.exception.scope === "location"
                    ? (r.locationName ?? "Sede")
                    : `${professionalDisplayName({ title: r.professionalTitle, firstName: r.professionalFirst ?? "", lastName: r.professionalLast ?? "" })}${r.locationName ? ` en ${r.locationName}` : ""}`,
            }))}
          />
        </section>
        {canWrite ? (
          <section className="flex flex-col gap-3">
            <h2 className="font-semibold">Agregar</h2>
            <ExceptionForm
              locations={locs}
              professionals={profs.map((p) => ({ id: p.id, name: p.displayName }))}
              action={createExceptionAction.bind(null, { returnTo: "/admin/excepciones" })}
            />
          </section>
        ) : null}
      </div>
    </>
  );
}
