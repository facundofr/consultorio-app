import type { Metadata } from "next";
import Link from "next/link";
import { DeleteButton } from "@/components/admin/delete-button";
import { ExceptionForm } from "@/components/admin/exception-form";
import { ExceptionList } from "@/components/admin/exception-list";
import { LinkTabs } from "@/components/admin/link-tabs";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { listLocations, listSpecialties } from "@/server/admin/catalog";
import { listExceptions } from "@/server/admin/exceptions";
import { getProfessional, listScheduleRules } from "@/server/admin/professionals";
import { can } from "@/server/auth/rbac";
import { getClinicContext } from "@/server/clinics/settings";
import {
  createExceptionAction,
  deleteExceptionAction,
  deleteProfessionalAction,
  saveProfessionalAction,
  saveScheduleAction,
} from "../../../_actions/professionals";
import { adminContext, param } from "../../../_lib/context";
import { loadOr404 } from "../../../_lib/load";
import { ProfessionalForm } from "../professional-form";
import { ScheduleEditor } from "../schedule-editor";

export const metadata: Metadata = { title: "Profesional" };

export default async function ProfessionalPage({ params, searchParams }: PageProps<"/admin/profesionales/[id]">) {
  const { db, actor, clinicId } = await adminContext();
  const { id } = await params;
  const tab = param(await searchParams, "tab") ?? "datos";
  const prof = await loadOr404(() => getProfessional(db, actor, id));
  const [specs, locs] = await Promise.all([listSpecialties(db, actor, clinicId, { includeInactive: true }), listLocations(db, actor, clinicId, { includeInactive: true })]);
  const profLocs = locs.filter((l) => prof.locationIds.includes(l.id));
  const base = `/admin/profesionales/${id}`;

  return (
    <>
      <PageHeader
        title={prof.displayName}
        description={prof.active ? undefined : "Inactivo: no recibe turnos nuevos."}
        actions={
          <>
            <Button asChild variant="outline"><Link href={`/admin/agenda?modo=profesional&id=${id}`}>Ver agenda</Link></Button>
            {can(actor, "delete", "professionals") ? (
              <DeleteButton id={prof.id} action={deleteProfessionalAction} redirectTo="/admin/profesionales" title="¿Dar de baja a este profesional?" description="Deja de aparecer en el panel y al reservar. Sus turnos pasados se conservan." />
            ) : null}
          </>
        }
      />
      <LinkTabs
        active={tab}
        tabs={[
          { key: "datos", label: "Datos", href: base },
          { key: "horarios", label: "Horario semanal", href: `${base}?tab=horarios` },
          { key: "excepciones", label: "Vacaciones y extras", href: `${base}?tab=excepciones` },
        ]}
      />
      {tab === "horarios" ? (
        <ScheduleTab id={id} locations={profLocs} canWrite={can(actor, "write", "schedules")} />
      ) : tab === "excepciones" ? (
        <ExceptionsTab id={id} clinicId={clinicId} locations={profLocs} canWrite={can(actor, "write", "schedules")} />
      ) : (
        <ProfessionalForm
          action={saveProfessionalAction.bind(null, id)}
          initial={prof}
          specialties={specs.filter((s) => s.active || prof.specialtyIds.includes(s.id))}
          locations={locs.filter((l) => l.active || prof.locationIds.includes(l.id))}
          readOnly={!can(actor, "write", "professionals")}
        />
      )}
    </>
  );
}

async function ScheduleTab({ id, locations, canWrite }: { id: string; locations: { id: string; name: string }[]; canWrite: boolean }) {
  const { db, actor } = await adminContext();
  const rules = await listScheduleRules(db, actor, id);
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-prose text-muted-foreground">
        Las franjas definen cuándo se ofrecen turnos. Los feriados, vacaciones y cierres se cargan aparte y se descuentan solos.
      </p>
      <ScheduleEditor
        locations={locations}
        readOnly={!canWrite}
        initial={rules.map(({ rule: r }) => ({
          locationId: r.locationId,
          weekday: r.weekday,
          startTime: r.startTime.slice(0, 5),
          endTime: r.endTime.slice(0, 5),
          validFrom: r.validFrom ?? "",
          validTo: r.validTo ?? "",
        }))}
        save={saveScheduleAction.bind(null, id)}
      />
    </div>
  );
}

async function ExceptionsTab({ id, clinicId, locations, canWrite }: { id: string; clinicId: string; locations: { id: string; name: string }[]; canWrite: boolean }) {
  const { db, actor } = await adminContext();
  const { clinic } = await getClinicContext(db, clinicId);
  const rows = await listExceptions(db, actor, clinicId, { professionalId: id, from: new Date() });
  const locName = Object.fromEntries(locations.map((l) => [l.id, l.name]));
  return (
    <div className="grid gap-8 xl:grid-cols-2">
      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Próximos</h2>
        <ExceptionList
          tz={clinic.timezone}
          canDelete={canWrite}
          deleteAction={deleteExceptionAction}
          items={rows.map(({ exception: e }) => ({ ...e, where: e.locationId ? (locName[e.locationId] ?? "Sede") : "Todas sus sedes" }))}
        />
        <p className="text-sm text-muted-foreground">Los feriados y cierres de sede se ven en «Feriados y bloqueos».</p>
      </section>
      {canWrite ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Agregar</h2>
          <ExceptionForm
            fixedProfessional
            locations={locations}
            action={createExceptionAction.bind(null, { scope: "professional", professionalId: id, returnTo: `/admin/profesionales/${id}` })}
          />
        </section>
      ) : null}
    </div>
  );
}
