"use client";

import Link from "next/link";
import { ActionForm, CheckboxField, FormActions, SubmitButton, TextField, type FormState } from "@/components/admin/form-kit";
import { Button } from "@/components/ui/button";

export function ClinicForm({
  action,
  initial,
  readOnly,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  initial?: { name: string; phone: string | null; email: string | null; website: string | null; timezone: string; active: boolean };
  readOnly?: boolean;
}) {
  return (
    <ActionForm action={action} readOnly={readOnly} className="max-w-xl">
      <TextField name="name" label="Nombre" required defaultValue={initial?.name} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField name="phone" label="Teléfono" type="tel" defaultValue={initial?.phone} />
        <TextField name="email" label="Email" type="email" defaultValue={initial?.email} />
      </div>
      <TextField name="website" label="Sitio web" defaultValue={initial?.website} />
      <TextField name="timezone" label="Zona horaria" defaultValue={initial?.timezone ?? "America/Argentina/Buenos_Aires"} hint="Formato IANA. Los horarios de la grilla se interpretan en esta zona." />
      <CheckboxField name="active" label="Clínica activa" defaultChecked={initial?.active ?? true} />
      {!readOnly ? (
        <FormActions>
          <SubmitButton>{initial ? "Guardar cambios" : "Crear clínica"}</SubmitButton>
          <Button asChild variant="ghost"><Link href="/admin/clinicas">Volver</Link></Button>
        </FormActions>
      ) : null}
    </ActionForm>
  );
}
