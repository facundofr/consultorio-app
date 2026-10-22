"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  deleteKbDoc,
  deleteLocation,
  deleteService,
  deleteSpecialty,
  saveKbDoc,
  saveLocation,
  saveService,
  saveSpecialty,
} from "@/server/admin/catalog";
import { adminContext } from "../_lib/context";
import { formToObject, runAction, runSimple, type ActionState } from "../_lib/action";

type Saver = (db: Awaited<ReturnType<typeof adminContext>>["db"], actor: Awaited<ReturnType<typeof adminContext>>["actor"], clinicId: string, input: never, id?: string) => Promise<unknown>;

async function save(path: string, saver: Saver, id: string | null, fd: FormData): Promise<ActionState> {
  const { db, actor, clinicId } = await adminContext();
  const values = formToObject(fd);
  const res = await runAction(values, async () => {
    await saver(db, actor, clinicId, values as never, id ?? undefined);
  });
  if (res.ok) {
    revalidatePath(path);
    if (!id) redirect(path);
  }
  return res;
}

async function remove(path: string, fn: (db: never, actor: never, id: string) => Promise<void>, fd: FormData) {
  const { db, actor } = await adminContext();
  const id = String(fd.get("id") ?? "");
  const res = await runSimple(async () => {
    await fn(db as never, actor as never, id);
    return "Dado de baja.";
  });
  if (res.ok) revalidatePath(path);
  return res;
}

export async function saveLocationAction(id: string | null, _: ActionState, fd: FormData) {
  return save("/admin/sedes", saveLocation as Saver, id, fd);
}
export async function deleteLocationAction(fd: FormData) {
  return remove("/admin/sedes", deleteLocation as never, fd);
}
export async function saveSpecialtyAction(id: string | null, _: ActionState, fd: FormData) {
  return save("/admin/especialidades", saveSpecialty as Saver, id, fd);
}
export async function deleteSpecialtyAction(fd: FormData) {
  return remove("/admin/especialidades", deleteSpecialty as never, fd);
}
export async function saveServiceAction(id: string | null, _: ActionState, fd: FormData) {
  return save("/admin/servicios", saveService as Saver, id, fd);
}
export async function deleteServiceAction(fd: FormData) {
  return remove("/admin/servicios", deleteService as never, fd);
}
export async function saveKbDocAction(id: string | null, _: ActionState, fd: FormData) {
  return save("/admin/faq", saveKbDoc as Saver, id, fd);
}
export async function deleteKbDocAction(fd: FormData) {
  return remove("/admin/faq", deleteKbDoc as never, fd);
}
