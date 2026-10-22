import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { getSettings } from "@/server/admin/clinics";
import { can } from "@/server/auth/rbac";
import { saveSettingsAction } from "../../_actions/people";
import { adminContext } from "../../_lib/context";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Ajustes" };

export default async function SettingsPage() {
  const { db, actor, clinicId } = await adminContext();
  const s = await getSettings(db, actor, clinicId);
  return (
    <>
      <PageHeader
        title="Ajustes de la clínica"
        actions={can(actor, "write", "clinics") ? <Button asChild variant="outline"><Link href={`/admin/clinicas/${clinicId}`}>Datos de la clínica</Link></Button> : null}
      />
      <SettingsForm action={saveSettingsAction} initial={s} readOnly={!can(actor, "write", "settings")} />
    </>
  );
}
