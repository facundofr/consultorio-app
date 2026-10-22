import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { can } from "@/server/auth/rbac";
import { adminContext } from "../../_lib/context";

export const metadata: Metadata = { title: "Conversaciones" };

export default async function ConversationsPage() {
  const { actor } = await adminContext();
  if (!can(actor, "read", "conversations")) notFound();
  return (
    <>
      <PageHeader title="Conversaciones del asistente" description="Registro para auditar lo que respondió el asistente. Se borran solas según la retención configurada." />
      <p className="text-muted-foreground">El asistente se habilita en el próximo hito. Acá vas a ver cada conversación con sus herramientas y el turno resultante.</p>
    </>
  );
}
