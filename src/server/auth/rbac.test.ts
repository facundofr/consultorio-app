import { describe, expect, it } from "vitest";
import { assertCan, assignableRoles, can, canAccessClinic, type Actor } from "./rbac";

const actor = (role: Actor["role"], clinicId: string | null = "c1"): Actor => ({
  id: "u", name: "U", email: "u@x", role, clinicId: role === "superadmin" ? null : clinicId,
});

describe("rbac", () => {
  it("superadmin can do everything anywhere", () => {
    expect(can(actor("superadmin"), "delete", "clinics")).toBe(true);
    expect(() => assertCan(actor("superadmin"), "write", "settings", "any-clinic")).not.toThrow();
  });

  it("clinic_admin manages their clinic but cannot delete clinics", () => {
    const a = actor("clinic_admin");
    expect(can(a, "write", "catalog")).toBe(true);
    expect(can(a, "write", "users")).toBe(true);
    expect(can(a, "delete", "clinics")).toBe(false);
    expect(() => assertCan(a, "write", "catalog", "c1")).not.toThrow();
    expect(() => assertCan(a, "write", "catalog", "c2")).toThrow(/clínica/);
  });

  it("staff handles the front desk only", () => {
    const s = actor("staff");
    expect(can(s, "write", "appointments")).toBe(true);
    expect(can(s, "write", "patients")).toBe(true);
    expect(can(s, "delete", "patients")).toBe(false);
    expect(can(s, "write", "catalog")).toBe(false);
    expect(can(s, "write", "settings")).toBe(false);
    expect(can(s, "read", "users")).toBe(false);
    expect(can(s, "read", "audit")).toBe(false);
    expect(can(s, "read", "conversations")).toBe(false);
    expect(can(s, "read", "exports")).toBe(false);
  });

  it("only administration exports patient data in bulk", () => {
    expect(can(actor("clinic_admin"), "read", "exports")).toBe(true);
    expect(can(actor("superadmin"), "read", "exports")).toBe(true);
    expect(() => assertCan(actor("clinic_admin"), "read", "exports", "c2")).toThrow(/clínica/);
  });

  it("clinic access requires matching clinic for non-superadmins", () => {
    expect(canAccessClinic(actor("staff"), "c1")).toBe(true);
    expect(canAccessClinic(actor("staff"), "c2")).toBe(false);
    expect(canAccessClinic(actor("staff"), null)).toBe(false);
  });

  it("role assignment never escalates", () => {
    expect(assignableRoles(actor("clinic_admin"))).not.toContain("superadmin");
    expect(assignableRoles(actor("staff"))).toEqual([]);
  });
});
