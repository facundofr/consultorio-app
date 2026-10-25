import type { UserRole } from "@/db/schema";
import { DomainError } from "@/server/errors";

/** The authenticated admin user, as seen by every server-side check. */
export type Actor = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  /** null only for superadmin */
  clinicId: string | null;
  /** Set for signed-in panel users (not in service-level tests). */
  twoFactorEnabled?: boolean;
  sessionId?: string;
};

export type Resource =
  | "clinics"
  | "settings"
  | "catalog" // locations, specialties, services, FAQ
  | "professionals"
  | "schedules" // weekly grids and exceptions
  | "patients"
  | "appointments"
  | "users"
  | "audit"
  | "conversations"
  | "dashboard"
  | "exports" // bulk downloads with decrypted contact data (CSV)
  | "emails"; // outbox: delivery status, test inbox, retries

export type Action = "read" | "write" | "delete";

const ALL: Action[] = ["read", "write", "delete"];
const RW: Action[] = ["read", "write"];
const R: Action[] = ["read"];

/**
 * Permission matrix.
 * - superadmin: everything, every clinic.
 * - clinic_admin: everything inside their clinic (no creating clinics, no superadmins).
 * - staff: front desk — agenda, appointments and patients; read-only catalog.
 *   No bulk exports: the CSV carries every patient's phone and email in clear.
 */
export const PERMISSIONS: Record<UserRole, Partial<Record<Resource, Action[]>>> = {
  superadmin: {
    clinics: ALL, settings: ALL, catalog: ALL, professionals: ALL, schedules: ALL, patients: ALL,
    appointments: ALL, users: ALL, audit: ALL, conversations: ALL, dashboard: ALL, exports: R, emails: RW,
  },
  clinic_admin: {
    clinics: RW, settings: RW, catalog: ALL, professionals: ALL, schedules: ALL, patients: ALL,
    appointments: RW, users: ALL, audit: R, conversations: R, dashboard: R, exports: R, emails: RW,
  },
  staff: {
    clinics: R, settings: R, catalog: R, professionals: R, schedules: R, patients: RW,
    appointments: RW, dashboard: R,
  },
};

export function can(actor: Pick<Actor, "role">, action: Action, resource: Resource): boolean {
  return PERMISSIONS[actor.role]?.[resource]?.includes(action) ?? false;
}

/** May the actor operate on data of this clinic at all? */
export function canAccessClinic(actor: Pick<Actor, "role" | "clinicId">, clinicId: string | null | undefined): boolean {
  if (actor.role === "superadmin") return true;
  return !!clinicId && actor.clinicId === clinicId;
}

/**
 * Throws FORBIDDEN unless the actor has the permission AND (when a clinic is
 * involved) belongs to that clinic. Call it in every admin service function.
 */
export function assertCan(actor: Actor, action: Action, resource: Resource, clinicId?: string | null): void {
  if (!can(actor, action, resource)) {
    throw new DomainError("FORBIDDEN", "No tenés permiso para hacer esto.");
  }
  if (clinicId !== undefined && !canAccessClinic(actor, clinicId)) {
    throw new DomainError("FORBIDDEN", "No tenés permiso sobre esta clínica.");
  }
}

/** Roles an actor may assign when creating/editing users. */
export function assignableRoles(actor: Pick<Actor, "role">): UserRole[] {
  if (actor.role === "superadmin") return ["superadmin", "clinic_admin", "staff"];
  if (actor.role === "clinic_admin") return ["clinic_admin", "staff"];
  return [];
}

export const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: "Superadmin",
  clinic_admin: "Administración de clínica",
  staff: "Recepción",
};
