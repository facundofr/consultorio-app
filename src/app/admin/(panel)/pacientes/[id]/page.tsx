import type { Metadata } from "next";
import Link from "next/link";
import { DeleteButton } from "@/components/admin/delete-button";
import { PageHeader, Section } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/time";
import { getPatientDetail } from "@/server/admin/patients";
import { professionalDisplayName } from "@/server/admin/professionals";
import { can } from "@/server/auth/rbac";
import { getClinicContext } from "@/server/clinics/settings";
import { deletePatientAction, savePatientAction } from "../../../_actions/people";
import { adminContext } from "../../../_lib/context";
import { loadOr404 } from "../../../_lib/load";
import { PatientForm } from "../patient-form";

export const metadata: Metadata = { title: "Paciente" };

export default async function PatientPage({ params }: PageProps<"/admin/pacientes/[id]">) {
  const { db, actor } = await adminContext();
  const { id } = await params;
  const p = await loadOr404(() => getPatientDetail(db, actor, id));
  const { clinic } = await getClinicContext(db, p.clinicId);
  return (
    <>
      <PageHeader
        title={p.fullName}
        description={p.consentAt ? `Aceptó la política de privacidad el ${p.consentAt.toLocaleDateString("es-AR")}.` : "Cargado por el equipo de la clínica."}
        actions={
          <>
            <Button asChild><Link href={`/admin/agenda?paciente=${p.id}`}>Darle un turno</Link></Button>
            {can(actor, "delete", "patients") ? <DeleteButton id={p.id} action={deletePatientAction} redirectTo="/admin/pacientes" title="¿Dar de baja este paciente?" description="Deja de aparecer en búsquedas. Sus turnos pasados se conservan." /> : null}
          </>
        }
      />
      <Section title="Datos de contacto">
        <PatientForm action={savePatientAction.bind(null, p.id)} initial={p} />
      </Section>
      <Section title="Turnos" description="Últimos 100.">
        {p.history.length === 0 ? (
          <p className="text-muted-foreground">Todavía no tiene turnos.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Profesional</TableHead>
                <TableHead>Consulta</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.history.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="tabular-nums">
                    <Link href={`/admin/turnos/${h.id}`} className="underline-offset-4 hover:underline">{formatDateTime(h.startsAt, clinic.timezone)}</Link>
                  </TableCell>
                  <TableCell>{professionalDisplayName({ title: h.professionalTitle, firstName: h.professionalFirst, lastName: h.professionalLast })}</TableCell>
                  <TableCell>{h.serviceName}, {h.locationName}</TableCell>
                  <TableCell><StatusBadge status={h.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </>
  );
}
