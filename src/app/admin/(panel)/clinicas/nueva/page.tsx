import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { requireActor } from "@/server/auth/session";
import { saveClinicAction } from "../../../_actions/people";
import { ClinicForm } from "../clinic-form";

export const metadata: Metadata = { title: "Nueva clínica" };

export default async function Page() {
  const actor = await requireActor();
  if (actor.role !== "superadmin") notFound();
  return (
    <>
      <PageHeader title="Nueva clínica" description="Después vas a poder cargar sus sedes, especialidades, profesionales y horarios." />
      <ClinicForm action={saveClinicAction.bind(null, null)} />
    </>
  );
}
