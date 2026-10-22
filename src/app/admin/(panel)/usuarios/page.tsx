import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SearchForm } from "@/components/admin/list-controls";
import { PageHeader } from "@/components/admin/page-header";
import { ActiveBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { listUsers } from "@/server/admin/users";
import { ROLE_LABELS } from "@/server/auth/rbac";
import { requireActor } from "@/server/auth/session";
import { param } from "../../_lib/context";
import { loadOr404 } from "../../_lib/load";

export const metadata: Metadata = { title: "Usuarios" };

export default async function UsersPage({ searchParams }: PageProps<"/admin/usuarios">) {
  const actor = await requireActor();
  const q = param(await searchParams, "q");
  const rows = await loadOr404(() => listUsers(getDb(), actor, { q }));
  return (
    <>
      <PageHeader title="Usuarios" description="Personas del equipo que usan este panel." actions={<Button asChild><Link href="/admin/usuarios/nuevo"><Plus /> Nuevo usuario</Link></Button>} />
      <SearchForm q={q} placeholder="Nombre o email" />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Rol</TableHead>
            {actor.role === "superadmin" ? <TableHead>Clínica</TableHead> : null}
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-semibold">
                <Link href={`/admin/usuarios/${u.id}`} className="underline-offset-4 hover:underline">{u.name}</Link>
              </TableCell>
              <TableCell>{u.email}</TableCell>
              <TableCell>{ROLE_LABELS[u.role]}</TableCell>
              {actor.role === "superadmin" ? <TableCell>{u.clinicName ?? "Todas"}</TableCell> : null}
              <TableCell><ActiveBadge active={u.active} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
