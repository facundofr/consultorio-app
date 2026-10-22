"use client";

import Link from "next/link";
import { useState } from "react";
import { ActionForm, CheckboxField, FormActions, SelectField, SubmitButton, TextField, type FormState } from "@/components/admin/form-kit";
import { Button } from "@/components/ui/button";

export function UserForm({
  action,
  initial,
  roles,
  clinics,
  isSelf,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  initial?: { name: string; email: string; role: string; clinicId: string | null; active: boolean };
  roles: { value: string; label: string }[];
  clinics: { id: string; name: string }[] | null;
  isSelf?: boolean;
}) {
  const [role, setRole] = useState(initial?.role ?? roles[roles.length - 1]?.value);
  return (
    <ActionForm action={action} className="max-w-xl">
      <TextField name="name" label="Nombre" required defaultValue={initial?.name} autoComplete="off" />
      <TextField name="email" label="Email" required type="email" defaultValue={initial?.email} autoComplete="off" />
      <SelectField name="role" label="Rol" defaultValue={role} onChange={(e) => setRole(e.target.value)} options={roles} disabled={isSelf} hint={
        role === "staff" ? "Recepción: agenda, turnos y pacientes. No cambia configuraciones." : role === "clinic_admin" ? "Administra todo dentro de su clínica, incluidos usuarios." : "Acceso total a todas las clínicas."
      } />
      {isSelf ? <input type="hidden" name="role" value={initial?.role} /> : null}
      {clinics && role !== "superadmin" ? (
        <SelectField name="clinicId" label="Clínica" required defaultValue={initial?.clinicId} placeholder="Elegí…" options={clinics.map((c) => ({ value: c.id, label: c.name }))} />
      ) : null}
      <TextField
        name="password"
        label={initial ? "Nueva contraseña" : "Contraseña inicial"}
        type="password"
        autoComplete="new-password"
        required={!initial}
        hint={initial ? "Dejala vacía para no cambiarla. Si la cambiás, se cierran sus sesiones abiertas." : "Mínimo 10 caracteres. Compartila por un canal seguro."}
      />
      {isSelf ? <input type="hidden" name="active" value="on" /> : <CheckboxField name="active" label="Usuario activo" hint="Un usuario inactivo no puede ingresar." defaultChecked={initial?.active ?? true} />}
      <FormActions>
        <SubmitButton>{initial ? "Guardar cambios" : "Crear usuario"}</SubmitButton>
        <Button asChild variant="ghost"><Link href="/admin/usuarios">Volver</Link></Button>
      </FormActions>
    </ActionForm>
  );
}
