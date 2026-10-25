import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmailStatusBadge } from "@/components/admin/email-status-badge";
import { Pagination } from "@/components/admin/list-controls";
import { EmptyState, PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { emailStatus } from "@/db/schema";
import { utcToLocal } from "@/lib/time";
import { EMAIL_KIND_LABELS, EMAIL_STATUS_LABELS, listEmails } from "@/server/admin/emails";
import { PAGE_SIZE } from "@/server/admin/common";
import { can } from "@/server/auth/rbac";
import { jobStatus } from "@/server/jobs";
import { adminContext, param } from "../../_lib/context";

export const metadata: Metadata = { title: "Emails" };

const fmt = (d: Date, tz: string) => {
  const l = utcToLocal(d, tz);
  return `${l.date.split("-").reverse().join("/")} ${l.time}`;
};

export default async function EmailsPage({ searchParams }: PageProps<"/admin/emails">) {
  const { db, actor, clinicId } = await adminContext();
  if (!can(actor, "read", "emails")) notFound();
  const sp = await searchParams;
  const f = { estado: param(sp, "estado") };
  const page = Number(param(sp, "page") ?? 1);
  const [list, jobs] = await Promise.all([listEmails(db, actor, clinicId, { status: f.estado }, page), jobStatus(db)]);
  const outboxRun = jobs.find((j) => j.name === "outbox")?.lastRunAt ?? null;
  // eslint-disable-next-line react-hooks/purity -- request-time page, compared against the server clock
  const stalled = !outboxRun || Date.now() - outboxRun.getTime() > 5 * 60_000;

  return (
    <>
      <PageHeader
        title="Emails a pacientes"
        description="Confirmaciones, cancelaciones, cambios de horario y recordatorios. Se envían solos en segundo plano y se reintentan si el proveedor falla. Una vez enviados, el contenido se borra."
      />
      {list.mode === "preview" ? (
        <p className="mb-4 rounded-lg bg-sol-claro px-4 py-3 text-sm text-tinta">
          <strong>Modo de prueba:</strong> no hay servidor de email configurado (<code>SMTP_HOST</code>), así que los emails <strong>no salen</strong>: quedan acá en la bandeja de prueba para revisarlos.
        </p>
      ) : null}
      {stalled ? (
        <p className="mb-4 rounded-lg bg-alerta-claro px-4 py-3 text-sm text-destructive" role="alert">
          <strong>Las tareas automáticas no están corriendo</strong>{outboxRun ? ` (última vez: ${fmt(outboxRun, list.timezone)})` : ""}: los emails quedan en cola sin salir. Revisá que la app tenga <code>JOBS_ENABLED</code> activo o que el cron de <code>pnpm jobs</code> esté funcionando.
        </p>
      ) : null}
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="estado">Estado</Label>
          <NativeSelect id="estado" name="estado" defaultValue={f.estado ?? ""}>
            <option value="">Todos</option>
            {emailStatus.enumValues.map((s) => <option key={s} value={s}>{EMAIL_STATUS_LABELS[s]}</option>)}
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline">Filtrar</Button>
      </form>

      {list.rows.length === 0 ? (
        <EmptyState title="Todavía no hay emails con ese filtro." />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Asunto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Turno</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    <Link href={`/admin/emails/${r.id}`} className="font-semibold underline-offset-4 hover:underline">
                      {fmt(r.createdAt, list.timezone)}
                    </Link>
                  </TableCell>
                  <TableCell>{EMAIL_KIND_LABELS[r.kind]}</TableCell>
                  <TableCell className="max-w-md truncate">{r.subject}</TableCell>
                  <TableCell>
                    <EmailStatusBadge status={r.status} />
                    {r.status === "pending" && r.attempts > 0 ? <span className="ml-2 text-xs text-muted-foreground">intento {r.attempts}</span> : null}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {r.appointmentId && r.appointmentCode ? (
                      <Link href={`/admin/turnos/${r.appointmentId}`} className="underline-offset-4 hover:underline">{r.appointmentCode}</Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={page} total={list.total} pageSize={PAGE_SIZE} params={f} />
        </>
      )}
    </>
  );
}
