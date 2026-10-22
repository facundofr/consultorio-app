import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { listSpecialties } from "@/server/admin/catalog";
import { saveServiceAction } from "../../../_actions/catalog";
import { adminContext } from "../../../_lib/context";
import { ServiceForm } from "../service-form";

export const metadata: Metadata = { title: "Nuevo tipo de consulta" };

export default async function Page() {
  const { db, actor, clinicId } = await adminContext();
  const specs = await listSpecialties(db, actor, clinicId);
  return (
    <>
      <PageHeader title="Nuevo tipo de consulta" />
      <ServiceForm action={saveServiceAction.bind(null, null)} specialties={specs} />
    </>
  );
}
