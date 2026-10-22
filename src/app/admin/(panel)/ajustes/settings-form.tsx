"use client";

import { ActionForm, FormActions, SubmitButton, TextAreaField, TextField, type FormState } from "@/components/admin/form-kit";
import { Section } from "@/components/admin/page-header";

export type SettingsValues = {
  cancelMinHours: number;
  slotStepMinutes: number;
  bookingHorizonDays: number;
  minLeadMinutes: number;
  reminderHours: number;
  welcomeText: string;
  assistantTone: string;
  contactPhone: string | null;
  contactEmail: string | null;
  contactHours: string | null;
  outOfWindowMessage: string;
  emergencyMessage: string;
};

export function SettingsForm({ action, initial, readOnly }: { action: (s: FormState, fd: FormData) => Promise<FormState>; initial: SettingsValues; readOnly?: boolean }) {
  const num = { type: "number", inputMode: "numeric" as const };
  return (
    <ActionForm action={action} readOnly={readOnly} className="gap-0">
      <Section title="Reservas y cancelaciones" description="Se aplican en el servidor a la reserva online, por chat y por formulario.">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField name="cancelMinHours" label="Horas mínimas para cancelar" {...num} min={0} max={720} defaultValue={initial.cancelMinHours} hint="El paciente puede cancelar online hasta esta cantidad de horas antes del turno." />
          <TextField name="reminderHours" label="Recordatorio (horas antes)" {...num} min={1} max={336} defaultValue={initial.reminderHours} hint="Se envía por email con el enlace para cancelar." />
          <TextField name="slotStepMinutes" label="Grilla de horarios (minutos)" {...num} min={5} max={240} defaultValue={initial.slotStepMinutes} hint="Cada cuánto empieza un turno posible: 15 → 9:00, 9:15, 9:30…" />
          <TextField name="minLeadMinutes" label="Anticipación mínima (minutos)" {...num} min={0} max={10080} defaultValue={initial.minLeadMinutes} hint="No se ofrecen turnos que empiecen antes de este margen." />
          <TextField name="bookingHorizonDays" label="Horizonte de reserva (días)" {...num} min={1} max={365} defaultValue={initial.bookingHorizonDays} hint="Hasta cuántos días adelante se puede reservar." />
        </div>
      </Section>
      <Section title="Asistente" description="Lo que dice al empezar y cómo habla.">
        <TextAreaField name="welcomeText" label="Mensaje de bienvenida" rows={2} defaultValue={initial.welcomeText} />
        <TextAreaField name="assistantTone" label="Tono" rows={2} defaultValue={initial.assistantTone} hint="Indicaciones de estilo. No cambian las reglas: el asistente nunca inventa horarios ni da consejo médico." />
      </Section>
      <Section title="Contacto" description="Se muestra cuando el paciente no puede resolver algo online.">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField name="contactPhone" label="Teléfono" type="tel" defaultValue={initial.contactPhone} />
          <TextField name="contactEmail" label="Email" type="email" defaultValue={initial.contactEmail} />
        </div>
        <TextField name="contactHours" label="Horario de atención telefónica" defaultValue={initial.contactHours} placeholder="Lunes a viernes de 8 a 20 h" />
      </Section>
      <Section title="Mensajes">
        <TextAreaField name="outOfWindowMessage" label="Cuando ya no se puede cancelar online" rows={3} defaultValue={initial.outOfWindowMessage} hint="Se agrega el teléfono de contacto al final." />
        <TextAreaField name="emergencyMessage" label="Ante una posible urgencia" rows={3} defaultValue={initial.emergencyMessage} hint="Se muestra cuando el paciente describe una urgencia. Incluí 911 y, si corresponde, el SAME (107)." />
      </Section>
      {!readOnly ? (
        <FormActions>
          <SubmitButton>Guardar ajustes</SubmitButton>
        </FormActions>
      ) : null}
    </ActionForm>
  );
}
