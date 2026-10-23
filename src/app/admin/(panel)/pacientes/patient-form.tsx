"use client";

import Link from "next/link";
import { ActionForm, FormActions, SubmitButton, TextField, type FormState } from "@/components/admin/form-kit";
import { Button } from "@/components/ui/button";

export function PatientForm({
  action,
  initial,
  readOnly,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  initial?: { fullName: string; phone: string; email: string | null };
  readOnly?: boolean;
}) {
  return (
    <ActionForm action={action} readOnly={readOnly} className="max-w-xl">
      <TextField name="fullName" label="Nombre y apellido" required defaultValue={initial?.fullName} autoComplete="off" />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField name="phone" label="Teléfono" required type="tel" defaultValue={initial?.phone} hint="Con código de área, por ejemplo 11 5555-1234." autoComplete="off" />
        <TextField name="email" label="Email" type="email" defaultValue={initial?.email} hint="Opcional. Sirve para que el paciente pueda buscar su turno con su email." autoComplete="off" />
      </div>
      {!readOnly ? (
        <FormActions>
          <SubmitButton>{initial ? "Guardar cambios" : "Crear paciente"}</SubmitButton>
          <Button asChild variant="ghost"><Link href="/admin/pacientes">Volver</Link></Button>
        </FormActions>
      ) : null}
    </ActionForm>
  );
}
