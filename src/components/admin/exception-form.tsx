"use client";

import { useState } from "react";
import { ActionForm, CheckboxField, FormActions, SelectField, SubmitButton, TextField, type FormState } from "@/components/admin/form-kit";

/**
 * Create a block (holiday, closure, vacation) or extra hours.
 * With `professional` fixed, the scope selector is hidden.
 */
export function ExceptionForm({
  action,
  locations,
  professionals,
  fixedProfessional,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  locations: { id: string; name: string }[];
  professionals?: { id: string; name: string }[];
  fixedProfessional?: boolean;
}) {
  const [scope, setScope] = useState(fixedProfessional ? "professional" : "clinic");
  const [kind, setKind] = useState("block");
  const [allDay, setAllDay] = useState(true);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <ActionForm action={action} className="max-w-2xl" onSuccess={() => { setKind("block"); setAllDay(true); }}>
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          name="kind"
          label="Tipo"
          defaultValue={kind}
          onChange={(e) => setKind(e.target.value)}
          options={[
            { value: "block", label: "Bloqueo (no se atiende)" },
            ...(scope === "professional" ? [{ value: "extra", label: "Horario extra" }] : []),
          ]}
        />
        {!fixedProfessional ? (
          <SelectField
            name="scope"
            label="Alcance"
            defaultValue={scope}
            onChange={(e) => { setScope(e.target.value); if (e.target.value !== "professional") setKind("block"); }}
            options={[
              { value: "clinic", label: "Toda la clínica (feriado)" },
              { value: "location", label: "Una sede" },
              { value: "professional", label: "Un profesional" },
            ]}
          />
        ) : null}
      </div>
      {!fixedProfessional && scope === "professional" ? (
        <SelectField name="professionalId" label="Profesional" placeholder="Elegí…" options={(professionals ?? []).map((p) => ({ value: p.id, label: p.name }))} />
      ) : null}
      {scope === "location" || (scope === "professional" && (kind === "extra" || locations.length > 1)) ? (
        <SelectField
          name="locationId"
          label="Sede"
          placeholder={scope === "professional" && kind === "block" ? "Todas sus sedes" : "Elegí…"}
          options={locations.map((l) => ({ value: l.id, label: l.name }))}
        />
      ) : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField name="startDate" label="Desde el" type="date" required defaultValue={today} />
        <TextField name="endDate" label="Hasta el (inclusive)" type="date" required defaultValue={today} />
      </div>
      {kind === "block" ? (
        <div onChange={(e) => setAllDay((e.target as HTMLInputElement).checked)}>
          <CheckboxField name="allDay" label="Todo el día" defaultChecked={allDay} />
        </div>
      ) : null}
      {kind === "extra" || !allDay ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField name="startTime" label="Hora de inicio" type="time" required />
          <TextField name="endTime" label="Hora de fin" type="time" required hint="Si abarca varios días, el bloqueo va de la hora de inicio del primero a la de fin del último." />
        </div>
      ) : null}
      <TextField name="reason" label="Motivo" placeholder={kind === "extra" ? "Atención extra" : "Vacaciones, feriado, congreso…"} />
      <FormActions>
        <SubmitButton>{kind === "extra" ? "Agregar horario extra" : "Agregar bloqueo"}</SubmitButton>
      </FormActions>
    </ActionForm>
  );
}
