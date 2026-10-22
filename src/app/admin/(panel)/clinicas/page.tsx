import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { ActiveBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { listClinics } from "@/server/admin/clinics";
import { requireActor } from "@/server/auth/session";

export const metadata: Metadata = { title: "Clínicas" };

export default async function ClinicsPage() {
  const actor = await requireActor();
  const rows = await listClinics(getDb(), actor);
  return (
    <>
      <PageHeader title="Clínicas" actions={actor.role === "superadmin" ? <Button asChild><Link href="/admin/clinicas/nueva"><Plus /> Nueva clínica</Link></Button> : null} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Teléfono</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-semibold"><Link href={`/admin/clinicas/${c.id}`} className="underline-offset-4 hover:underline">{c.name}</Link></TableCell>
              <TableCell>{c.phone ?? "—"}</TableCell>
              <TableCell>{c.email ?? "—"}</TableCell>
              <TableCell><ActiveBadge active={c.active} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
