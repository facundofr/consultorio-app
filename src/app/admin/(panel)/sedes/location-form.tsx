"use client";

import Link from "next/link";
import { ActionForm, CheckboxField, FormActions, SubmitButton, TextAreaField, TextField, type FormState } from "@/components/admin/form-kit";
import { Button } from "@/components/ui/button";

export type LocationFormValues = { name: string; address: string; city: string | null; phone: string | null; notes: string | null; active: boolean };

export function LocationForm({
  action,
  initial,
  readOnly,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  initial?: LocationFormValues;
  readOnly?: boolean;
}) {
  return (
    <ActionForm action={action} readOnly={readOnly} className="max-w-2xl">
      <TextField name="name" label="Nombre" required defaultValue={initial?.name} placeholder="Sede Centro" />
      <TextField name="address" label="Dirección" required defaultValue={initial?.address} autoComplete="street-address" />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField name="city" label="Localidad" defaultValue={initial?.city} />
        <TextField name="phone" label="Teléfono" type="tel" defaultValue={initial?.phone} />
      </div>
      <TextAreaField name="notes" label="Indicaciones para llegar" hint="Se muestra al paciente en la confirmación del turno." defaultValue={initial?.notes} rows={3} />
      <CheckboxField name="active" label="Sede activa" hint="Las sedes inactivas no aparecen al reservar." defaultChecked={initial?.active ?? true} />
      {!readOnly ? (
        <FormActions>
          <SubmitButton>{initial ? "Guardar cambios" : "Crear sede"}</SubmitButton>
          <Button asChild variant="ghost">
            <Link href="/admin/sedes">Volver</Link>
          </Button>
        </FormActions>
      ) : null}
    </ActionForm>
  );
}
