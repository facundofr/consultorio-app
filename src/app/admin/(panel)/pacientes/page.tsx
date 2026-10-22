import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Pagination, SearchForm } from "@/components/admin/list-controls";
import { EmptyState, PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PAGE_SIZE } from "@/server/admin/common";
import { searchPatients } from "@/server/admin/patients";
import { adminContext, param } from "../../_lib/context";

export const metadata: Metadata = { title: "Pacientes" };

const MODE_HINT = {
  phone: "Buscando por teléfono exacto.",
  email: "Buscando por email exacto.",
  code: "Buscando por código de turno.",
  name: "Buscando por nombre.",
  all: "",
};

export default async function PatientsPage({ searchParams }: PageProps<"/admin/pacientes">) {
  const { db, actor, clinicId } = await adminContext();
  const sp = await searchParams;
  const q = param(sp, "q");
  const page = Number(param(sp, "page") ?? 1);
  const { rows, total, mode } = await searchPatients(db, actor, clinicId, { q, page });
  return (
    <>
      <PageHeader
        title="Pacientes"
        description="Los teléfonos y emails se guardan cifrados: se buscan completos, no por partes."
        actions={<Button asChild><Link href="/admin/pacientes/nuevo"><Plus /> Nuevo paciente</Link></Button>}
      />
      <SearchForm q={q} label="Buscar paciente" placeholder="Nombre, teléfono completo, email o código de turno" />
      {q && mode !== "all" ? <p className="-mt-2 mb-3 text-sm text-muted-foreground">{MODE_HINT[mode]}</p> : null}
      {rows.length === 0 ? (
        <EmptyState title={q ? "No encontramos pacientes con esa búsqueda." : "Todavía no hay pacientes."}>
          {q && mode === "phone" ? "Revisá el número completo, con código de área." : null}
        </EmptyState>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Paciente</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead className="text-right">Turnos</TableHead>
                <TableHead>Alta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-semibold">
                    <Link href={`/admin/pacientes/${p.id}`} className="underline-offset-4 hover:underline">{p.fullName}</Link>
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">termina en {p.phoneLast4}</TableCell>
                  <TableCell className="text-right tabular-nums">{p.appointmentCount}</TableCell>
                  <TableCell className="tabular-nums">{p.createdAt.toLocaleDateString("es-AR")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} params={{ q }} />
        </>
      )}
    </>
  );
}
