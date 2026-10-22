import "server-only";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { requireAdminContext } from "@/server/auth/session";

/** Admin page/action prelude: db + actor + the clinic being managed. */
export async function adminContext() {
  const { actor, clinicId } = await requireAdminContext();
  if (!clinicId) redirect(actor.role === "superadmin" ? "/admin/clinicas/nueva" : "/admin/login");
  return { db: getDb(), actor, clinicId };
}

export type SearchParams = Record<string, string | string[] | undefined>;

export function param(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
