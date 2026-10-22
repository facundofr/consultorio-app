import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { saveKbDocAction } from "../../../_actions/catalog";
import { adminContext } from "../../../_lib/context";
import { KbForm } from "../kb-form";

export const metadata: Metadata = { title: "Nueva pregunta" };

export default async function Page() {
  await adminContext();
  return (
    <>
      <PageHeader title="Nueva pregunta frecuente" />
      <KbForm action={saveKbDocAction.bind(null, null)} />
    </>
  );
}
