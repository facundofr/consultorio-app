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
import { listServices, listSpecialties } from "@/server/admin/catalog";
import { formatMoney } from "@/server/admin/common";
import { can } from "@/server/auth/rbac";
import { adminContext, param } from "../../_lib/context";

export const metadata: Metadata = { title: "Tipos de consulta" };

export default async function ServicesPage({ searchParams }: PageProps<"/admin/servicios">) {
  const { db, actor, clinicId } = await adminContext();
  const sp = await searchParams;
  const q = param(sp, "q");
  const specialtyId = param(sp, "especialidad");
  const [rows, specs] = await Promise.all([
    listServices(db, actor, clinicId, { q, specialtyId, includeInactive: true }),
    listSpecialties(db, actor, clinicId),
  ]);
  const canWrite = can(actor, "write", "catalog");
  return (
    <>
      <PageHeader
        title="Tipos de consulta"
        description="Cada tipo define cuánto dura el turno y, si corresponde, su precio."
        actions={canWrite ? <Button asChild><Link href="/admin/servicios/nueva"><Plus /> Nuevo tipo</Link></Button> : null}
      />
      <SearchForm q={q} placeholder="Nombre">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="especialidad">Especialidad</Label>
          <NativeSelect id="especialidad" name="especialidad" defaultValue={specialtyId ?? ""} className="sm:w-56">
            <option value="">Todas</option>
            {specs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </NativeSelect>
        </div>
      </SearchForm>
      {rows.length === 0 ? (
        <EmptyState title="No hay tipos de consulta para mostrar." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Especialidad</TableHead>
              <TableHead className="text-right">Duración</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ service: s, specialtyName }) => (
              <TableRow key={s.id}>
                <TableCell className="font-semibold">
                  <Link href={`/admin/servicios/${s.id}`} className="underline-offset-4 hover:underline">{s.name}</Link>
                </TableCell>
                <TableCell>{specialtyName ?? "Todas"}</TableCell>
                <TableCell className="text-right tabular-nums">{s.durationMinutes} min</TableCell>
                <TableCell className="text-right tabular-nums">{s.priceCents === null ? "—" : formatMoney(s.priceCents)}</TableCell>
                <TableCell><ActiveBadge active={s.active} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
