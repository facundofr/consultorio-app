import type { Metadata } from "next";
import { DeleteButton } from "@/components/admin/delete-button";
import { PageHeader } from "@/components/admin/page-header";
import { getDb } from "@/db/client";
import { getClinic } from "@/server/admin/clinics";
import { can } from "@/server/auth/rbac";
import { requireActor } from "@/server/auth/session";
import { deleteClinicAction, saveClinicAction } from "../../../_actions/people";
import { loadOr404 } from "../../../_lib/load";
import { ClinicForm } from "../clinic-form";

export const metadata: Metadata = { title: "Clínica" };

export default async function Page({ params }: PageProps<"/admin/clinicas/[id]">) {
  const actor = await requireActor();
  const { id } = await params;
  const c = await loadOr404(() => getClinic(getDb(), actor, id));
  return (
    <>
      <PageHeader
        title={c.name}
        actions={can(actor, "delete", "clinics") ? <DeleteButton id={c.id} action={deleteClinicAction} redirectTo="/admin/clinicas" title="¿Dar de baja esta clínica?" description="Deja de aparecer en el panel y no recibe más turnos. Los datos se conservan." /> : null}
      />
      <ClinicForm action={saveClinicAction.bind(null, c.id)} initial={c} readOnly={!can(actor, "write", "clinics")} />
    </>
  );
}
