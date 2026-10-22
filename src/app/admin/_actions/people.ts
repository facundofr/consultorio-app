"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteClinic, saveClinic, saveSettings } from "@/server/admin/clinics";
import { deletePatient, savePatient } from "@/server/admin/patients";
import { saveUser } from "@/server/admin/users";
import { requireActor } from "@/server/auth/session";
import { getDb } from "@/db/client";
import { adminContext } from "../_lib/context";
import { formToObject, runAction, runSimple, type ActionState } from "../_lib/action";

export async function savePatientAction(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const { db, actor, clinicId } = await adminContext();
  const values = formToObject(fd);
  let newId: string | undefined;
  const res = await runAction(values, async () => {
    newId = await savePatient(db, actor, clinicId, values as never, id ?? undefined);
  });
  if (res.ok) {
    revalidatePath("/admin/pacientes");
    if (!id && newId) redirect(`/admin/pacientes/${newId}`);
  }
  return res;
}

export async function deletePatientAction(fd: FormData) {
  const { db, actor } = await adminContext();
  const res = await runSimple(async () => {
    await deletePatient(db, actor, String(fd.get("id")));
    return "Paciente dado de baja.";
  });
  if (res.ok) revalidatePath("/admin/pacientes");
  return res;
}

export async function saveUserAction(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(fd);
  const res = await runAction(values, async () => {
    await saveUser(getDb(), actor, values as never, id ?? undefined);
    return id ? "Usuario actualizado." : "Usuario creado.";
  });
  if (res.ok) {
    revalidatePath("/admin/usuarios");
    if (!id) redirect("/admin/usuarios");
  }
  return res;
}

export async function saveClinicAction(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireActor();
  const values = formToObject(fd);
  const res = await runAction(values, async () => {
    await saveClinic(getDb(), actor, values as never, id ?? undefined);
  });
  if (res.ok) {
    revalidatePath("/admin", "layout");
    if (!id) redirect("/admin/clinicas");
  }
  return res;
}

export async function deleteClinicAction(fd: FormData) {
  const actor = await requireActor();
  const res = await runSimple(async () => {
    await deleteClinic(getDb(), actor, String(fd.get("id")));
    return "Clínica dada de baja.";
  });
  if (res.ok) revalidatePath("/admin", "layout");
  return res;
}

export async function saveSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { db, actor, clinicId } = await adminContext();
  const values = formToObject(fd);
  const res = await runAction(values, async () => {
    await saveSettings(db, actor, clinicId, values as never);
    return "Ajustes guardados.";
  });
  if (res.ok) revalidatePath("/admin/ajustes");
  return res;
}
