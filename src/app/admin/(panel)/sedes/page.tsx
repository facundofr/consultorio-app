import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/admin/page-header";
import { SearchForm } from "@/components/admin/list-controls";
import { ActiveBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listLocations } from "@/server/admin/catalog";
import { can } from "@/server/auth/rbac";
import { adminContext, param } from "../../_lib/context";

export const metadata: Metadata = { title: "Sedes" };

export default async function LocationsPage({ searchParams }: PageProps<"/admin/sedes">) {
  const { db, actor, clinicId } = await adminContext();
  const sp = await searchParams;
  const q = param(sp, "q");
  const rows = await listLocations(db, actor, clinicId, { q, includeInactive: true });
  const canWrite = can(actor, "write", "catalog");
  return (
    <>
      <PageHeader
        title="Sedes"
        description="Lugares donde atienden los profesionales."
        actions={canWrite ? <Button asChild><Link href="/admin/sedes/nueva"><Plus /> Nueva sede</Link></Button> : null}
      />
      <SearchForm q={q} placeholder="Nombre o dirección" />
      {rows.length === 0 ? (
        <EmptyState title={q ? "No hay sedes que coincidan con la búsqueda." : "Todavía no cargaste sedes."}>
          {canWrite && !q ? "Creá la primera sede para poder asignarle profesionales y horarios." : null}
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Dirección</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-semibold">
                  <Link href={`/admin/sedes/${r.id}`} className="underline-offset-4 hover:underline">{r.name}</Link>
                </TableCell>
                <TableCell>{r.address}{r.city ? `, ${r.city}` : ""}</TableCell>
                <TableCell>{r.phone ?? "—"}</TableCell>
                <TableCell><ActiveBadge active={r.active} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
