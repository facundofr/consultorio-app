import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SearchForm } from "@/components/admin/list-controls";
import { EmptyState, PageHeader } from "@/components/admin/page-header";
import { ActiveBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listSpecialties } from "@/server/admin/catalog";
import { can } from "@/server/auth/rbac";
import { adminContext, param } from "../../_lib/context";

export const metadata: Metadata = { title: "Especialidades" };

export default async function SpecialtiesPage({ searchParams }: PageProps<"/admin/especialidades">) {
  const { db, actor, clinicId } = await adminContext();
  const q = param(await searchParams, "q");
  const rows = await listSpecialties(db, actor, clinicId, { q, includeInactive: true });
  const canWrite = can(actor, "write", "catalog");
  return (
    <>
      <PageHeader
        title="Especialidades"
        actions={canWrite ? <Button asChild><Link href="/admin/especialidades/nueva"><Plus /> Nueva especialidad</Link></Button> : null}
      />
      <SearchForm q={q} placeholder="Nombre" />
      {rows.length === 0 ? (
        <EmptyState title={q ? "No hay especialidades que coincidan." : "Todavía no cargaste especialidades."} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-semibold">
                  <Link href={`/admin/especialidades/${r.id}`} className="underline-offset-4 hover:underline">{r.name}</Link>
                </TableCell>
                <TableCell className="max-w-md truncate text-muted-foreground">{r.description ?? "—"}</TableCell>
                <TableCell><ActiveBadge active={r.active} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
