import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { saveSpecialtyAction } from "../../../_actions/catalog";
import { adminContext } from "../../../_lib/context";
import { SpecialtyForm } from "../specialty-form";

export const metadata: Metadata = { title: "Nueva especialidad" };

export default async function Page() {
  await adminContext();
  return (
    <>
      <PageHeader title="Nueva especialidad" />
      <SpecialtyForm action={saveSpecialtyAction.bind(null, null)} />
    </>
  );
}
