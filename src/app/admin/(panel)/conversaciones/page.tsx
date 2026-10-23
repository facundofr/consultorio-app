import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pagination } from "@/components/admin/list-controls";
import { EmptyState, PageHeader } from "@/components/admin/page-header";
import { CONVERSATION_STATUS_LABELS, ConversationBadge } from "@/components/admin/conversation-badge";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { conversationStatus } from "@/db/schema";
import { utcToLocal } from "@/lib/time";
import { listConversations } from "@/server/admin/conversations";
import { PAGE_SIZE } from "@/server/admin/common";
import { assistantConfig } from "@/server/assistant/config";
import { can } from "@/server/auth/rbac";
import { adminContext, param } from "../../_lib/context";

export const metadata: Metadata = { title: "Conversaciones" };

const fmt = (d: Date, tz: string) => {
  const l = utcToLocal(d, tz);
  return `${l.date.split("-").reverse().join("/")} ${l.time}`;
};

export default async function ConversationsPage({ searchParams }: PageProps<"/admin/conversaciones">) {
  const { db, actor, clinicId } = await adminContext();
  if (!can(actor, "read", "conversations")) notFound();
  const sp = await searchParams;
  const f = { desde: param(sp, "desde"), hasta: param(sp, "hasta"), estado: param(sp, "estado") };
  const page = Number(param(sp, "page") ?? 1);
  const list = await listConversations(db, actor, clinicId, { from: f.desde, to: f.hasta, status: f.estado }, page);
  const cfg = assistantConfig();

  return (
    <>
      <PageHeader
        title="Conversaciones del asistente"
        description={`Registro para auditar lo que respondió el asistente. Los teléfonos y emails que escriben los pacientes se borran antes de guardar. Se eliminan solas a los ${cfg.retentionDays} días.`}
      />
      {!cfg.enabled ? (
        <p className="mb-4 rounded-lg bg-sol-claro px-4 py-3 text-sm">
          El asistente está apagado: no hay ninguna clave de proveedor configurada (<code>GROQ_API_KEY</code>, <code>GEMINI_API_KEY</code> u <code>OPENROUTER_API_KEY</code>) o <code>AI_ENABLED=false</code>. Los pacientes ven el formulario.
        </p>
      ) : null}
      <form method="get" className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="desde">Desde</Label>
          <Input id="desde" name="desde" type="date" defaultValue={f.desde} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hasta">Hasta</Label>
          <Input id="hasta" name="hasta" type="date" defaultValue={f.hasta} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="estado">Estado</Label>
          <NativeSelect id="estado" name="estado" defaultValue={f.estado ?? ""}>
            <option value="">Todos</option>
            {conversationStatus.enumValues.map((s) => <option key={s} value={s}>{CONVERSATION_STATUS_LABELS[s]}</option>)}
          </NativeSelect>
        </div>
        <Button type="submit" variant="outline">Filtrar</Button>
      </form>

      {list.rows.length === 0 ? (
        <EmptyState title="No hay conversaciones con esos filtros." />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Último mensaje</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Mensajes</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead>Turno</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    <Link href={`/admin/conversaciones/${r.id}`} className="font-semibold underline-offset-4 hover:underline">
                      {fmt(r.lastMessageAt, list.timezone)}
                    </Link>
                  </TableCell>
                  <TableCell><ConversationBadge status={r.status} /></TableCell>
                  <TableCell className="text-right tabular-nums">{r.messageCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.tokenCount.toLocaleString("es-AR")}</TableCell>
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
