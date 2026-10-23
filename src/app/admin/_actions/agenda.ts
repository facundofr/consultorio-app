"use server";

import { z } from "zod";
import { getAgendaMonth, type AgendaMonth } from "@/server/admin/agenda";
import { isDomainError } from "@/server/errors";
import { adminContext } from "../_lib/context";

const Query = z.object({
  mode: z.enum(["professional", "location"]),
  subjectId: z.string().uuid().nullable(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

/** Month summary for the agenda's mini calendar when the user changes month. */
export async function agendaMonthAction(raw: z.input<typeof Query>): Promise<AgendaMonth | null> {
  const { db, actor, clinicId } = await adminContext();
  const q = Query.safeParse(raw);
  if (!q.success) return null;
  try {
    return await getAgendaMonth(db, actor, clinicId, q.data);
  } catch (e) {
    if (isDomainError(e)) return null;
    throw e;
  }
}
