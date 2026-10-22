import type { Metadata } from "next";
import { DeleteButton } from "@/components/admin/delete-button";
import { PageHeader } from "@/components/admin/page-header";
import { getService, listSpecialties } from "@/server/admin/catalog";
import { can } from "@/server/auth/rbac";
import { deleteServiceAction, saveServiceAction } from "../../../_actions/catalog";
import { adminContext } from "../../../_lib/context";
import { loadOr404 } from "../../../_lib/load";
import { ServiceForm } from "../service-form";

export const metadata: Metadata = { title: "Tipo de consulta" };

export default async function Page({ params }: PageProps<"/admin/servicios/[id]">) {
  const { db, actor, clinicId } = await adminContext();
  const { id } = await params;
  const row = await loadOr404(() => getService(db, actor, id));
  const specs = await listSpecialties(db, actor, clinicId, { includeInactive: true });
  const price = row.priceCents === null ? "" : String(row.priceCents / 100).replace(".", ",");
  return (
    <>
      <PageHeader
        title={row.name}
        actions={can(actor, "delete", "catalog") ? <DeleteButton id={row.id} action={deleteServiceAction} redirectTo="/admin/servicios" title="¿Dar de baja este tipo de consulta?" /> : null}
      />
      <ServiceForm action={saveServiceAction.bind(null, row.id)} initial={{ ...row, price }} specialties={specs} readOnly={!can(actor, "write", "catalog")} />
    </>
  );
}
