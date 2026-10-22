"use client";

import Link from "next/link";
import { ActionForm, CheckboxField, FormActions, SubmitButton, TextAreaField, TextField, type FormState } from "@/components/admin/form-kit";
import { Button } from "@/components/ui/button";

export function KbForm({
  action,
  initial,
  readOnly,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  initial?: { question: string; answer: string; tags: string[]; active: boolean };
  readOnly?: boolean;
}) {
  return (
    <ActionForm action={action} readOnly={readOnly} className="max-w-2xl">
      <TextField name="question" label="Pregunta" required defaultValue={initial?.question} placeholder="¿Qué tengo que llevar al turno?" />
      <TextAreaField
        name="answer"
        label="Respuesta"
        required
        defaultValue={initial?.answer}
        rows={6}
        hint="El asistente responde solo con lo que esté cargado acá. Escribila como se la dirías al paciente."
      />
      <TextField name="tags" label="Etiquetas" defaultValue={initial?.tags.join(", ")} placeholder="documentación, llegada" hint="Separadas por coma. Ayudan al asistente a encontrar la respuesta." />
      <CheckboxField name="active" label="Publicada" hint="Las preguntas no publicadas no las usa el asistente." defaultChecked={initial?.active ?? true} />
      {!readOnly ? (
        <FormActions>
          <SubmitButton>{initial ? "Guardar cambios" : "Crear pregunta"}</SubmitButton>
          <Button asChild variant="ghost"><Link href="/admin/faq">Volver</Link></Button>
        </FormActions>
      ) : null}
    </ActionForm>
  );
}
