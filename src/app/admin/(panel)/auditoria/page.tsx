import type { Metadata } from "next";
import { Pagination } from "@/components/admin/list-controls";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PAGE_SIZE } from "@/server/admin/common";
import { listAudit } from "@/server/admin/dashboard";
import { adminContext, param } from "../../_lib/context";
import { loadOr404 } from "../../_lib/load";

export const metadata: Metadata = { title: "Auditoría" };

const ACTIONS: Record<string, string> = {
  create: "Creó", update: "Modificó", delete: "Dio de baja", cancel: "Canceló", move: "Movió", status: "Cambió estado", export: "Exportó", login: "Ingresó",
};
const ENTITIES: Record<string, string> = {
  appointment: "turno", appointments: "turnos", patient: "paciente", professional: "profesional", schedule: "horario semanal", schedule_exception: "excepción",
  location: "sede", specialty: "especialidad", service: "tipo de consulta", kb_doc: "pregunta frecuente", user: "usuario", clinic: "clínica", settings: "ajustes",
};

export default async function AuditPage({ searchParams }: PageProps<"/admin/auditoria">) {
  const { db, actor, clinicId } = await adminContext();
  const sp = await searchParams;
  const entity = param(sp, "entidad");
  const action = param(sp, "accion");
  const page = Number(param(sp, "page") ?? 1);
  const { rows, total } = await loadOr404(() => listAudit(db, actor, clinicId, { entity, action, page }));
  return (
    <>
      <PageHeader title="Auditoría" description="Registro de las acciones del equipo en el panel. No incluye datos personales de pacientes." />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="accion">Acción</Label>
          <NativeSelect id="accion" name="accion" defaultValue={action ?? ""} className="w-44">
            <option value="">Todas</option>
            {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="entidad">Sobre</Label>
          <NativeSelect id="entidad" name="entidad" defaultValue={entity ?? ""} className="w-52">
            <option value="">Todo</option>
            {Object.entries(ENTITIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline">Filtrar</Button>
      </form>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cuándo</TableHead>
            <TableHead>Quién</TableHead>
            <TableHead>Qué</TableHead>
            <TableHead>Detalle</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ log, userName }) => (
            <TableRow key={log.id}>
              <TableCell className="whitespace-nowrap tabular-nums">{log.createdAt.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}</TableCell>
              <TableCell>{userName ?? "Sistema"}</TableCell>
              <TableCell>{ACTIONS[log.action] ?? log.action} {ENTITIES[log.entity] ?? log.entity}</TableCell>
              <TableCell className="max-w-md truncate text-sm text-muted-foreground">
                {log.data && "fields" in log.data && Array.isArray(log.data.fields) ? `Campos: ${(log.data.fields as string[]).join(", ") || "ninguno"}` : log.data ? JSON.stringify(log.data) : ""}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination page={page} total={total} pageSize={PAGE_SIZE} params={{ entidad: entity, accion: action }} />
    </>
  );
}
