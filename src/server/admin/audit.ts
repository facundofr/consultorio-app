import type { DbOrTx } from "@/db/client";
import { auditLog } from "@/db/schema";
import type { Actor } from "@/server/auth/rbac";

export type AuditEntry = {
  action: string;
  entity: string;
  entityId?: string | null;
  clinicId?: string | null;
  /** Never put personal data here (names, phones, emails): ids and field names only. */
  data?: Record<string, unknown>;
};

export async function audit(db: DbOrTx, actor: Pick<Actor, "id"> | null, e: AuditEntry) {
  await db.insert(auditLog).values({
    userId: actor?.id ?? null,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId ?? null,
    clinicId: e.clinicId ?? null,
    data: e.data ?? null,
  });
}

/** Names of fields that changed between two objects (values are not logged). */
export function changedFields<T extends Record<string, unknown>>(before: T, after: Partial<T>): string[] {
  return Object.keys(after).filter((k) => {
    const a = before[k];
    const b = after[k];
    if (a instanceof Date && b instanceof Date) return a.getTime() !== b.getTime();
    return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
  });
}
