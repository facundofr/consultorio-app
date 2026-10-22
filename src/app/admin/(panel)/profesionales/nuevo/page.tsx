import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { listLocations, listSpecialties } from "@/server/admin/catalog";
import { saveProfessionalAction } from "../../../_actions/professionals";
import { adminContext } from "../../../_lib/context";
import { ProfessionalForm } from "../professional-form";

export const metadata: Metadata = { title: "Nuevo profesional" };

export default async function Page() {
  const { db, actor, clinicId } = await adminContext();
  const [specs, locs] = await Promise.all([listSpecialties(db, actor, clinicId), listLocations(db, actor, clinicId)]);
  return (
    <>
      <PageHeader title="Nuevo profesional" description="Después de crearlo vas a poder cargar su horario semanal." />
      <ProfessionalForm action={saveProfessionalAction.bind(null, null)} specialties={specs} locations={locs} />
    </>
  );
}
