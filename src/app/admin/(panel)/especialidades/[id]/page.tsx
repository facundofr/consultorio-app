import type { Metadata } from "next";
import { DeleteButton } from "@/components/admin/delete-button";
import { PageHeader } from "@/components/admin/page-header";
import { getSpecialty } from "@/server/admin/catalog";
import { can } from "@/server/auth/rbac";
import { deleteSpecialtyAction, saveSpecialtyAction } from "../../../_actions/catalog";
import { adminContext } from "../../../_lib/context";
import { loadOr404 } from "../../../_lib/load";
import { SpecialtyForm } from "../specialty-form";

export const metadata: Metadata = { title: "Especialidad" };

export default async function Page({ params }: PageProps<"/admin/especialidades/[id]">) {
  const { db, actor } = await adminContext();
  const { id } = await params;
  const row = await loadOr404(() => getSpecialty(db, actor, id));
  return (
    <>
      <PageHeader
        title={row.name}
        actions={can(actor, "delete", "catalog") ? <DeleteButton id={row.id} action={deleteSpecialtyAction} redirectTo="/admin/especialidades" title="¿Dar de baja esta especialidad?" /> : null}
      />
      <SpecialtyForm action={saveSpecialtyAction.bind(null, row.id)} initial={row} readOnly={!can(actor, "write", "catalog")} />
    </>
  );
}
