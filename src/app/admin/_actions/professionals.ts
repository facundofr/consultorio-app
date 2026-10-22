"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createException, deleteException } from "@/server/admin/exceptions";
import { deleteProfessional, replaceScheduleRules, saveProfessional, type ScheduleRuleInput } from "@/server/admin/professionals";
import { adminContext } from "../_lib/context";
import { formToObject, runAction, runSimple, type ActionState } from "../_lib/action";

export async function saveProfessionalAction(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const { db, actor, clinicId } = await adminContext();
  const values = formToObject(fd);
  let newId: string | undefined;
  const res = await runAction(values, async () => {
    newId = await saveProfessional(db, actor, clinicId, values as never, id ?? undefined);
  });
  if (res.ok) {
    revalidatePath("/admin/profesionales");
    if (!id && newId) redirect(`/admin/profesionales/${newId}?tab=horarios`);
  }
  return res;
}

export async function deleteProfessionalAction(fd: FormData) {
  const { db, actor } = await adminContext();
  const res = await runSimple(async () => {
    await deleteProfessional(db, actor, String(fd.get("id")));
    return "Profesional dado de baja.";
  });
  if (res.ok) revalidatePath("/admin/profesionales");
  return res;
}

export async function saveScheduleAction(professionalId: string, rules: ScheduleRuleInput[]): Promise<ActionState> {
  const { db, actor } = await adminContext();
  const res = await runSimple(async () => {
    await replaceScheduleRules(db, actor, professionalId, z.array(z.any()).parse(rules));
    return "Horario guardado.";
  });
  if (res.ok) revalidatePath(`/admin/profesionales/${professionalId}`);
  return res;
}

export async function createExceptionAction(fixed: { scope?: "professional"; professionalId?: string; returnTo: string }, _: ActionState, fd: FormData): Promise<ActionState> {
  const { db, actor, clinicId } = await adminContext();
  const values = formToObject(fd);
  const input = { ...values, ...(fixed.scope ? { scope: fixed.scope, professionalId: fixed.professionalId } : {}) };
  const res = await runAction(values, async () => {
    const r = await createException(db, actor, clinicId, input as never);
    return r.affectedAppointments > 0
      ? `Guardado. Atención: hay ${r.affectedAppointments} turno(s) confirmados en ese período. Revisalos en la agenda.`
      : "Guardado.";
  });
  if (res.ok) revalidatePath(fixed.returnTo);
  return res;
}

export async function deleteExceptionAction(fd: FormData) {
  const { db, actor } = await adminContext();
  const res = await runSimple(async () => {
    await deleteException(db, actor, String(fd.get("id")));
    return "Eliminado.";
  });
  if (res.ok) {
    revalidatePath("/admin/excepciones");
    revalidatePath("/admin/profesionales", "layout");
  }
  return res;
}
