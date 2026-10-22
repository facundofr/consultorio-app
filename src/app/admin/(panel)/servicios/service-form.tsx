"use client";

import Link from "next/link";
import { ActionForm, CheckboxField, FormActions, SelectField, SubmitButton, TextAreaField, TextField, type FormState } from "@/components/admin/form-kit";
import { Button } from "@/components/ui/button";

export type ServiceFormValues = {
  name: string;
  specialtyId: string | null;
  description: string | null;
  durationMinutes: number;
  price: string;
  active: boolean;
};

export function ServiceForm({
  action,
  initial,
  specialties,
  readOnly,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  initial?: ServiceFormValues;
  specialties: { id: string; name: string }[];
  readOnly?: boolean;
}) {
  return (
    <ActionForm action={action} readOnly={readOnly} className="max-w-2xl">
      <TextField name="name" label="Nombre" required defaultValue={initial?.name} placeholder="Primera consulta" />
      <SelectField
        name="specialtyId"
        label="Especialidad"
        defaultValue={initial?.specialtyId}
        placeholder="Todas las especialidades"
        options={specialties.map((s) => ({ value: s.id, label: s.name }))}
        hint="Si la dejás en «Todas», cualquier profesional de la clínica puede ofrecerla."
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField name="durationMinutes" label="Duración (minutos)" required type="number" inputMode="numeric" min={5} max={480} step={5} defaultValue={initial?.durationMinutes ?? 30} />
        <TextField name="price" label="Precio (opcional)" inputMode="decimal" defaultValue={initial?.price} placeholder="35000" hint="Solo si la consulta es particular. El asistente lo informa tal cual." />
      </div>
      <TextAreaField name="description" label="Descripción" defaultValue={initial?.description} rows={3} />
      <CheckboxField name="active" label="Disponible para reservar" defaultChecked={initial?.active ?? true} />
      {!readOnly ? (
        <FormActions>
          <SubmitButton>{initial ? "Guardar cambios" : "Crear tipo de consulta"}</SubmitButton>
          <Button asChild variant="ghost"><Link href="/admin/servicios">Volver</Link></Button>
        </FormActions>
      ) : null}
    </ActionForm>
  );
}
