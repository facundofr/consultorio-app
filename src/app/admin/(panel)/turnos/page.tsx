import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Pagination } from "@/components/admin/list-controls";
import { EmptyState, PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { appointmentSource, appointmentStatus } from "@/db/schema";
import { addDays, utcToLocal } from "@/lib/time";
import { listAppointments, SOURCE_LABELS, STATUS_LABELS } from "@/server/admin/appointments";
import { listLocations } from "@/server/admin/catalog";
import { PAGE_SIZE } from "@/server/admin/common";
import { listProfessionals } from "@/server/admin/professionals";
import { can } from "@/server/auth/rbac";
import { getClinicContext } from "@/server/clinics/settings";
import { adminContext, param } from "../../_lib/context";

export const metadata: Metadata = { title: "Turnos" };

export default async function AppointmentsPage({ searchParams }: PageProps<"/admin/turnos">) {
  const { db, actor, clinicId } = await adminContext();
  const sp = await searchParams;
  const { clinic } = await getClinicContext(db, clinicId);
  const today = utcToLocal(new Date(), clinic.timezone).date;
  const f = {
    desde: param(sp, "desde") ?? today,
    hasta: param(sp, "hasta") ?? addDays(today, 13),
    profesional: param(sp, "profesional"),
    sede: param(sp, "sede"),
    estado: param(sp, "estado"),
    origen: param(sp, "origen"),
    q: param(sp, "q"),
  };
  const page = Number(param(sp, "page") ?? 1);
  const [list, profs, locs] = await Promise.all([
    listAppointments(db, actor, clinicId, { from: f.desde, to: f.hasta, professionalId: f.profesional, locationId: f.sede, status: f.estado, source: f.origen, q: f.q }, page),
    listProfessionals(db, actor, clinicId, { includeInactive: true }),
    listLocations(db, actor, clinicId, { includeInactive: true }),
  ]);
  const exportQs = new URLSearchParams(Object.entries(f).filter(([, v]) => !!v) as [string, string][]).toString();
  const tz = list.timezone;

  return (
    <>
      <PageHeader
        title="Turnos"
        actions={
          can(actor, "read", "exports") ? (
            <Button asChild variant="outline">
              <a href={`/admin/exportar-turnos?${exportQs}`} download>
                <Download /> Exportar CSV
              </a>
            </Button>
          ) : undefined
        }
      />
      <form method="get" className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 xl:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="desde">Desde</Label>
          <Input id="desde" name="desde" type="date" defaultValue={f.desde} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hasta">Hasta</Label>
          <Input id="hasta" name="hasta" type="date" defaultValue={f.hasta} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profesional">Profesional</Label>
          <NativeSelect id="profesional" name="profesional" defaultValue={f.profesional ?? ""}>
            <option value="">Todos</option>
            {profs.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sede">Sede</Label>
          <NativeSelect id="sede" name="sede" defaultValue={f.sede ?? ""}>
            <option value="">Todas</option>
            {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="estado">Estado</Label>
          <NativeSelect id="estado" name="estado" defaultValue={f.estado ?? ""}>
            <option value="">Todos</option>
            {appointmentStatus.enumValues.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="origen">Origen</Label>
          <NativeSelect id="origen" name="origen" defaultValue={f.origen ?? ""}>
            <option value="">Todos</option>
            {appointmentSource.enumValues.map((s) => <option key={s} value={s}>{SOURCE_LABELS[s]}</option>)}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="q">Código o paciente</Label>
          <Input id="q" name="q" type="search" defaultValue={f.q} placeholder="T-8KQ4ZP" />
        </div>
        <Button type="submit" variant="outline">Filtrar</Button>
      </form>

      {list.rows.length === 0 ? (
        <EmptyState title="No hay turnos con esos filtros." />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>Profesional</TableHead>
                <TableHead>Consulta</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead>Código</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.rows.map((r) => {
                const l = utcToLocal(r.startsAt, tz);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      <Link href={`/admin/turnos/${r.id}`} className="font-semibold underline-offset-4 hover:underline">
                        {l.date.split("-").reverse().join("/")} {l.time}
                      </Link>
                    </TableCell>
                    <TableCell>{r.patientName}</TableCell>
                    <TableCell>{r.professionalName}</TableCell>
                    <TableCell>{r.serviceName}<span className="text-muted-foreground">, {r.locationName}</span></TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-muted-foreground">{SOURCE_LABELS[r.source]}</TableCell>
                    <TableCell className="tabular-nums">{r.code}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Pagination page={page} total={list.total} pageSize={PAGE_SIZE} params={f} />
        </>
      )}
    </>
  );
}
