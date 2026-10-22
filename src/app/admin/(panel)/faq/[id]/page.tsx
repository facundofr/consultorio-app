import type { Metadata } from "next";
import { DeleteButton } from "@/components/admin/delete-button";
import { PageHeader } from "@/components/admin/page-header";
import { getKbDoc } from "@/server/admin/catalog";
import { can } from "@/server/auth/rbac";
import { deleteKbDocAction, saveKbDocAction } from "../../../_actions/catalog";
import { adminContext } from "../../../_lib/context";
import { loadOr404 } from "../../../_lib/load";
import { KbForm } from "../kb-form";

export const metadata: Metadata = { title: "Pregunta frecuente" };

export default async function Page({ params }: PageProps<"/admin/faq/[id]">) {
  const { db, actor } = await adminContext();
  const { id } = await params;
  const row = await loadOr404(() => getKbDoc(db, actor, id));
  return (
    <>
      <PageHeader
        title="Pregunta frecuente"
        actions={can(actor, "delete", "catalog") ? <DeleteButton id={row.id} action={deleteKbDocAction} redirectTo="/admin/faq" title="¿Dar de baja esta pregunta?" description="El asistente deja de usarla." /> : null}
      />
      <KbForm action={saveKbDocAction.bind(null, row.id)} initial={row} readOnly={!can(actor, "write", "catalog")} />
    </>
  );
}
