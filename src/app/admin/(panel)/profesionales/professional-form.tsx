"use client";

import Link from "next/link";
import { ActionForm, CheckboxField, CheckboxGroupField, FormActions, SubmitButton, TextAreaField, TextField, type FormState } from "@/components/admin/form-kit";
import { Button } from "@/components/ui/button";

export type ProfessionalFormValues = {
  title: string | null;
  firstName: string;
  lastName: string;
  licenseNumber: string | null;
  bio: string | null;
  active: boolean;
  specialtyIds: string[];
  locationIds: string[];
};

export function ProfessionalForm({
  action,
  initial,
  specialties,
  locations,
  readOnly,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  initial?: ProfessionalFormValues;
  specialties: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  readOnly?: boolean;
}) {
  return (
    <ActionForm action={action} readOnly={readOnly} className="max-w-2xl">
      <div className="grid gap-5 sm:grid-cols-[8rem_1fr_1fr]">
        <TextField name="title" label="Tratamiento" defaultValue={initial?.title} placeholder="Dra." />
        <TextField name="firstName" label="Nombre" required defaultValue={initial?.firstName} />
        <TextField name="lastName" label="Apellido" required defaultValue={initial?.lastName} />
      </div>
      <TextField name="licenseNumber" label="Matrícula" defaultValue={initial?.licenseNumber} placeholder="MN 123456" className="sm:max-w-xs" />
      <CheckboxGroupField name="specialtyIds" legend="Especialidades" options={specialties.map((s) => ({ value: s.id, label: s.name }))} defaultValue={initial?.specialtyIds} />
      <CheckboxGroupField
        name="locationIds"
        legend="Sedes donde atiende"
        options={locations.map((l) => ({ value: l.id, label: l.name }))}
        defaultValue={initial?.locationIds}
        hint="Si quitás una sede, se borran los horarios cargados en ella."
      />
      <TextAreaField name="bio" label="Presentación" hint="Opcional. Se muestra al elegir profesional." defaultValue={initial?.bio} rows={3} />
      <CheckboxField name="active" label="Recibe turnos" hint="Si lo desactivás, deja de aparecer al reservar pero conserva su agenda." defaultChecked={initial?.active ?? true} />
      {!readOnly ? (
        <FormActions>
          <SubmitButton>{initial ? "Guardar cambios" : "Crear y cargar horarios"}</SubmitButton>
          <Button asChild variant="ghost"><Link href="/admin/profesionales">Volver</Link></Button>
        </FormActions>
      ) : null}
    </ActionForm>
  );
}
