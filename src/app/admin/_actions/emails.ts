"use server";

import { revalidatePath } from "next/cache";
import { retryEmail } from "@/server/admin/emails";
import { adminContext } from "../_lib/context";
import { runSimple } from "../_lib/action";

export async function retryEmailAction(id: string) {
  const { db, actor } = await adminContext();
  const res = await runSimple(async () => {
    await retryEmail(db, actor, id);
    return "Listo: el email volvió a la cola y se envía en el próximo minuto.";
  });
  if (res.ok) revalidatePath(`/admin/emails/${id}`);
  return res;
}
