import type { Metadata } from "next";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { getLocation } from "@/server/admin/catalog";
import { can } from "@/server/auth/rbac";
import { deleteLocationAction, saveLocationAction } from "../../../_actions/catalog";
import { adminContext } from "../../../_lib/context";
import { loadOr404 } from "../../../_lib/load";
import { LocationForm } from "../location-form";

export const metadata: Metadata = { title: "Sede" };

export default async function EditLocationPage({ params }: PageProps<"/admin/sedes/[id]">) {
  const { db, actor } = await adminContext();
  const { id } = await params;
  const loc = await loadOr404(() => getLocation(db, actor, id));
  const canWrite = can(actor, "write", "catalog");
  return (
    <>
      <PageHeader
        title={loc.name}
        actions={
          can(actor, "delete", "catalog") ? (
            <ConfirmAction
              trigger={<Button variant="outline">Dar de baja</Button>}
              title="¿Dar de baja esta sede?"
              description="Deja de aparecer al reservar y en el panel. Los turnos pasados se conservan."
              confirmLabel="Dar de baja"
              action={deleteLocationAction}
              redirectTo="/admin/sedes"
            >
              <input type="hidden" name="id" value={loc.id} />
            </ConfirmAction>
          ) : null
        }
      />
      <LocationForm action={saveLocationAction.bind(null, loc.id)} initial={loc} readOnly={!canWrite} />
    </>
  );
}
