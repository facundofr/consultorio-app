import type { Metadata } from "next";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { listClinics } from "@/server/admin/clinics";
import { getUser } from "@/server/admin/users";
import { assignableRoles, can, ROLE_LABELS } from "@/server/auth/rbac";
import { requireActor } from "@/server/auth/session";
import { resetUserTwoFactorAction } from "../../../_actions/account";
import { saveUserAction } from "../../../_actions/people";
import { loadOr404 } from "../../../_lib/load";
import { UserForm } from "../user-form";

export const metadata: Metadata = { title: "Usuario" };

export default async function Page({ params }: PageProps<"/admin/usuarios/[id]">) {
  const actor = await requireActor();
  const { id } = await params;
  const u = await loadOr404(() => getUser(getDb(), actor, id));
  const clinics = actor.role === "superadmin" ? await listClinics(getDb(), actor) : null;
  const isSelf = u.id === actor.id;
  const twoFactor = !!u.totpEnabledAt;
  return (
    <>
      <PageHeader
        title={u.name}
        description={isSelf ? "Es tu usuario. El doble factor y la contraseña se cambian en «Mi cuenta y seguridad»." : `Doble factor: ${twoFactor ? "activado" : "no configurado"}.`}
        actions={
          !isSelf && twoFactor && can(actor, "write", "users") ? (
            <ConfirmAction
              trigger={<Button variant="outline">Quitar doble factor</Button>}
              title="¿Quitar el doble factor de este usuario?"
              description="Usalo solo si perdió el celular y sus códigos de respaldo. Se cierran sus sesiones; va a poder entrar con la contraseña y configurarlo de nuevo."
              confirmLabel="Quitar doble factor"
              action={() => resetUserTwoFactorAction(u.id)}
            />
          ) : null
        }
      />
      <UserForm
        action={saveUserAction.bind(null, u.id)}
        initial={{ name: u.name, email: u.email, role: u.role, clinicId: u.clinicId, active: u.active }}
        isSelf={isSelf}
        roles={assignableRoles(actor).map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
        clinics={clinics}
      />
    </>
  );
}
