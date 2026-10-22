import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { getDb } from "@/db/client";
import { listClinics } from "@/server/admin/clinics";
import { assignableRoles, can, ROLE_LABELS } from "@/server/auth/rbac";
import { requireActor } from "@/server/auth/session";
import { saveUserAction } from "../../../_actions/people";
import { UserForm } from "../user-form";

export const metadata: Metadata = { title: "Nuevo usuario" };

export default async function Page() {
  const actor = await requireActor();
  if (!can(actor, "write", "users")) notFound();
  const clinics = actor.role === "superadmin" ? await listClinics(getDb(), actor) : null;
  return (
    <>
      <PageHeader title="Nuevo usuario" />
      <UserForm action={saveUserAction.bind(null, null)} roles={assignableRoles(actor).map((r) => ({ value: r, label: ROLE_LABELS[r] }))} clinics={clinics} />
    </>
  );
}
