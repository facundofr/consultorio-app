import type { Metadata } from "next";
import { StepHeading } from "@/components/public/wizard-ui";
import { Lookup } from "./lookup";

export const metadata: Metadata = { title: "Mi turno", robots: { index: false } };

export default function MyAppointmentPage() {
  return (
    <>
      <StepHeading title="Ver o cancelar tu turno">Ingresá el código del turno y el teléfono o el email que usaste al reservar.</StepHeading>
      <Lookup />
    </>
  );
}
