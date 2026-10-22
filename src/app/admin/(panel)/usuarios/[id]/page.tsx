import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { getDb } from "@/db/client";
import { listClinics } from "@/server/admin/clinics";
import { getUser } from "@/server/admin/users";
import { assignableRoles, ROLE_LABELS } from "@/server/auth/rbac";
import { requireActor } from "@/server/auth/session";
import { saveUserAction } from "../../../_actions/people";
import { loadOr404 } from "../../../_lib/load";
import { UserForm } from "../user-form";

export const metadata: Metadata = { title: "Usuario" };

export default async function Page({ params }: PageProps<"/admin/usuarios/[id]">) {
  const actor = await requireActor();
  const { id } = await params;
  const u = await loadOr404(() => getUser(getDb(), actor, id));
  const clinics = actor.role === "superadmin" ? await listClinics(getDb(), actor) : null;
  return (
    <>
      <PageHeader title={u.name} description={u.id === actor.id ? "Es tu usuario." : undefined} />
      <UserForm
        action={saveUserAction.bind(null, u.id)}
        initial={u}
        isSelf={u.id === actor.id}
        roles={assignableRoles(actor).map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
        clinics={clinics}
      />
    </>
  );
}
