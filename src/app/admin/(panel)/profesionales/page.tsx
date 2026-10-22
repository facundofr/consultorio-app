import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SearchForm } from "@/components/admin/list-controls";
import { EmptyState, PageHeader } from "@/components/admin/page-header";
import { ActiveBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listLocations, listSpecialties } from "@/server/admin/catalog";
import { listProfessionals } from "@/server/admin/professionals";
import { can } from "@/server/auth/rbac";
import { adminContext, param } from "../../_lib/context";

export const metadata: Metadata = { title: "Profesionales" };

export default async function ProfessionalsPage({ searchParams }: PageProps<"/admin/profesionales">) {
  const { db, actor, clinicId } = await adminContext();
  const sp = await searchParams;
  const q = param(sp, "q");
  const specialtyId = param(sp, "especialidad");
  const locationId = param(sp, "sede");
  const [rows, specs, locs] = await Promise.all([
    listProfessionals(db, actor, clinicId, { q, specialtyId, locationId, includeInactive: true }),
    listSpecialties(db, actor, clinicId),
    listLocations(db, actor, clinicId),
  ]);
  const canWrite = can(actor, "write", "professionals");
  return (
    <>
      <PageHeader
        title="Profesionales y horarios"
        actions={canWrite ? <Button asChild><Link href="/admin/profesionales/nuevo"><Plus /> Nuevo profesional</Link></Button> : null}
      />
      <SearchForm q={q} placeholder="Nombre, apellido o matrícula">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="especialidad">Especialidad</Label>
          <NativeSelect id="especialidad" name="especialidad" defaultValue={specialtyId ?? ""} className="sm:w-48">
            <option value="">Todas</option>
            {specs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sede">Sede</Label>
          <NativeSelect id="sede" name="sede" defaultValue={locationId ?? ""} className="sm:w-44">
            <option value="">Todas</option>
            {locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </NativeSelect>
        </div>
      </SearchForm>
      {rows.length === 0 ? (
        <EmptyState title="No hay profesionales para mostrar." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Profesional</TableHead>
              <TableHead>Especialidades</TableHead>
              <TableHead>Sedes</TableHead>
              <TableHead>Matrícula</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-semibold">
                  <Link href={`/admin/profesionales/${p.id}`} className="underline-offset-4 hover:underline">{p.displayName}</Link>
                </TableCell>
                <TableCell>{p.specialties.map((s) => s.name).join(", ")}</TableCell>
                <TableCell>{p.locations.map((l) => l.name).join(", ")}</TableCell>
                <TableCell className="text-muted-foreground">{p.licenseNumber ?? "—"}</TableCell>
                <TableCell><ActiveBadge active={p.active} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
