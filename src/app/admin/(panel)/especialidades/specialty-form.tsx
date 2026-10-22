"use client";

import Link from "next/link";
import { ActionForm, CheckboxField, FormActions, SubmitButton, TextAreaField, TextField, type FormState } from "@/components/admin/form-kit";
import { Button } from "@/components/ui/button";

export function SpecialtyForm({
  action,
  initial,
  readOnly,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  initial?: { name: string; description: string | null; active: boolean };
  readOnly?: boolean;
}) {
  return (
    <ActionForm action={action} readOnly={readOnly} className="max-w-2xl">
      <TextField name="name" label="Nombre" required defaultValue={initial?.name} placeholder="Cardiología" />
      <TextAreaField name="description" label="Descripción" hint="Opcional. El asistente la puede usar para orientar al paciente." defaultValue={initial?.description} rows={3} />
      <CheckboxField name="active" label="Especialidad activa" defaultChecked={initial?.active ?? true} />
      {!readOnly ? (
        <FormActions>
          <SubmitButton>{initial ? "Guardar cambios" : "Crear especialidad"}</SubmitButton>
          <Button asChild variant="ghost"><Link href="/admin/especialidades">Volver</Link></Button>
        </FormActions>
      ) : null}
    </ActionForm>
  );
}
