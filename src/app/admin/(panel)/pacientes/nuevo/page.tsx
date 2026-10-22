import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { savePatientAction } from "../../../_actions/people";
import { adminContext } from "../../../_lib/context";
import { PatientForm } from "../patient-form";

export const metadata: Metadata = { title: "Nuevo paciente" };

export default async function Page() {
  await adminContext();
  return (
    <>
      <PageHeader title="Nuevo paciente" description="Pedí solo lo necesario para el turno: nombre, teléfono y email. No cargues diagnósticos ni datos clínicos." />
      <PatientForm action={savePatientAction.bind(null, null)} />
    </>
  );
}
