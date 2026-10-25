import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { accounts, auditLog, clinics, sessions, users } from "@/db/schema";
import { totpCode, totpStep } from "@/lib/totp";
import { changeOwnPassword } from "@/server/admin/users";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import type { Actor } from "@/server/auth/rbac";
import {
  beginTwoFactorSetup,
  confirmTwoFactorSetup,
  disableOwnTwoFactor,
  regenerateBackupCodes,
  resetTwoFactor,
  twoFactorRequired,
  verifySessionCode,
} from "@/server/auth/two-factor";
import { resetDb, testDb } from "./helpers";

const holder = testDb(10);
const db = holder.db;
afterAll(() => holder.sql.end());

const T0 = new Date("2026-10-25T12:00:00Z");
const at = (s: number) => new Date(T0.getTime() + s * 1000);
const codeAt = (secret: string, when: Date) => totpCode(secret, totpStep(when));

let clinicId: string;
let otherClinicId: string;

async function makeUser(role: Actor["role"], clinic: string | null = clinicId) {
  const id = randomUUID();
  await db.insert(users).values({ id, name: `U ${role}`, email: `${id}@x.test`, role, clinicId: role === "superadmin" ? null : clinic });
  await db.insert(accounts).values({ id: randomUUID(), userId: id, accountId: id, providerId: "credential", password: await hashPassword("clave-vieja-123") });
  const actor: Actor = { id, name: `U ${role}`, email: `${id}@x.test`, role, clinicId: role === "superadmin" ? null : clinic };
  return actor;
}

async function openSession(userId: string) {
  const id = randomUUID();
  await db.insert(sessions).values({ id, userId, token: randomUUID(), expiresAt: new Date(Date.now() + 3600_000) });
  return id;
}

async function enable(actor: Actor, sessionId: string) {
  const { secret } = await beginTwoFactorSetup(db, actor.id);
  const codes = await confirmTwoFactorSetup(db, actor.id, sessionId, codeAt(secret, T0), T0);
  return { secret, codes };
}

beforeEach(async () => {
  await resetDb(db);
  const [c1, c2] = await db.insert(clinics).values([{ name: "A", slug: "a" }, { name: "B", slug: "b" }]).returning();
  clinicId = c1.id;
  otherClinicId = c2.id;
});

describe("two-factor setup", () => {
  it("turns on with the first code, keeps this session and closes the others", async () => {
    const u = await makeUser("clinic_admin");
    const current = await openSession(u.id);
    const other = await openSession(u.id);
    const { secret, uri } = await beginTwoFactorSetup(db, u.id);
    expect(uri).toContain(`secret=${secret}`);
    const [pending] = await db.select().from(users).where(eq(users.id, u.id));
    expect(pending.totpEnabledAt).toBeNull();
    expect(pending.totpSecretEnc).not.toContain(secret); // encrypted at rest

    await expect(confirmTwoFactorSetup(db, u.id, current, "000000", T0)).rejects.toMatchObject({ code: "VALIDATION" });
    const codes = await confirmTwoFactorSetup(db, u.id, current, codeAt(secret, T0), T0);
    expect(codes).toHaveLength(10);

    const [row] = await db.select().from(users).where(eq(users.id, u.id));
    expect(row.totpEnabledAt).not.toBeNull();
    expect(JSON.stringify(row.backupCodeHashes)).not.toContain(codes[0].replace("-", ""));
    const left = await db.select().from(sessions).where(eq(sessions.userId, u.id));
    expect(left.map((s) => s.id)).toEqual([current]);
    expect(left[0].twoFactorVerifiedAt).not.toBeNull();
    expect(left.map((s) => s.id)).not.toContain(other);
  });
});

describe("sign-in with a code", () => {
  it("a valid code verifies the session; the same code never works twice", async () => {
    const u = await makeUser("staff");
    const { secret } = await enable(u, await openSession(u.id));
    const s = await openSession(u.id);
    const when = at(90);
    const code = codeAt(secret, when);
    await expect(verifySessionCode(db, u.id, s, code, when)).resolves.toMatchObject({ method: "totp" });
    const [row] = await db.select().from(sessions).where(eq(sessions.id, s));
    expect(row.twoFactorVerifiedAt).not.toBeNull();
    const s2 = await openSession(u.id);
    await expect(verifySessionCode(db, u.id, s2, code, when)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("the same code sent twice at once passes only once", async () => {
    const u = await makeUser("staff");
    const { secret } = await enable(u, await openSession(u.id));
    const [a, b] = [await openSession(u.id), await openSession(u.id)];
    const when = at(120);
    const code = codeAt(secret, when);
    const res = await Promise.allSettled([verifySessionCode(db, u.id, a, code, when), verifySessionCode(db, u.id, b, code, when)]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("backup codes work once each", async () => {
    const u = await makeUser("staff");
    const { codes } = await enable(u, await openSession(u.id));
    const s = await openSession(u.id);
    await expect(verifySessionCode(db, u.id, s, codes[3].toLowerCase(), at(60))).resolves.toMatchObject({ method: "backup", backupCodesLeft: 9 });
    await expect(verifySessionCode(db, u.id, await openSession(u.id), codes[3], at(61))).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("wrong codes are audited and limited to 5 per 15 minutes", async () => {
    const u = await makeUser("staff");
    const { secret } = await enable(u, await openSession(u.id));
    const s = await openSession(u.id);
    for (let i = 0; i < 4; i++) await expect(verifySessionCode(db, u.id, s, "111111", at(60 + i))).rejects.toMatchObject({ code: "VALIDATION" });
    // The 5th attempt (counting the setup confirmation) is refused even with the right code.
    await expect(verifySessionCode(db, u.id, s, codeAt(secret, at(70)), at(70))).rejects.toMatchObject({ code: "RATE_LIMITED" });
    const failed = await db.select().from(auditLog).where(eq(auditLog.action, "login.2fa_failed"));
    expect(failed).toHaveLength(4);
  });
});

describe("managing two-factor", () => {
  it("new backup codes replace the old ones", async () => {
    const u = await makeUser("staff");
    const { secret, codes } = await enable(u, await openSession(u.id));
    const fresh = await regenerateBackupCodes(db, u, codeAt(secret, at(60)), at(60));
    await expect(verifySessionCode(db, u.id, await openSession(u.id), codes[0], at(90))).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(verifySessionCode(db, u.id, await openSession(u.id), fresh[0], at(91))).resolves.toMatchObject({ method: "backup" });
  });

  it("turning it off needs a code and is blocked for roles that require it", async () => {
    const u = await makeUser("staff");
    const { secret } = await enable(u, await openSession(u.id));
    await expect(disableOwnTwoFactor(db, u, "000000", at(60))).rejects.toMatchObject({ code: "VALIDATION" });
    process.env.TWO_FACTOR_REQUIRED_ROLES = "staff";
    try {
      await expect(disableOwnTwoFactor(db, u, codeAt(secret, at(90)), at(90))).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      delete process.env.TWO_FACTOR_REQUIRED_ROLES;
    }
    await disableOwnTwoFactor(db, u, codeAt(secret, at(120)), at(120));
    const [row] = await db.select().from(users).where(eq(users.id, u.id));
    expect(row).toMatchObject({ totpEnabledAt: null, totpSecretEnc: null, backupCodeHashes: null });
  });

  it("administration can reset it only for users of its clinic", async () => {
    const admin = await makeUser("clinic_admin");
    const mine = await makeUser("staff");
    const foreign = await makeUser("staff", otherClinicId);
    const boss = await makeUser("superadmin");
    for (const u of [mine, foreign, boss]) await enable(u, await openSession(u.id));
    await expect(resetTwoFactor(db, admin, foreign.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(resetTwoFactor(db, admin, boss.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(resetTwoFactor(db, await makeUser("staff"), mine.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await resetTwoFactor(db, admin, mine.id);
    const [row] = await db.select().from(users).where(eq(users.id, mine.id));
    expect(row.totpEnabledAt).toBeNull();
    expect(await db.select().from(sessions).where(eq(sessions.userId, mine.id))).toHaveLength(0);
  });

  it("reads the required roles from the environment", () => {
    expect(twoFactorRequired("superadmin", "superadmin, clinic_admin")).toBe(true);
    expect(twoFactorRequired("staff", "superadmin, clinic_admin")).toBe(false);
    expect(twoFactorRequired("staff", "")).toBe(false);
  });
});

describe("own password", () => {
  it("needs the current password and closes the other sessions", async () => {
    const u = await makeUser("staff");
    const current = await openSession(u.id);
    await openSession(u.id);
    const me = { ...u, sessionId: current };
    await expect(changeOwnPassword(db, me, { current: "mal", next: "clave-nueva-456", confirm: "clave-nueva-456" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(changeOwnPassword(db, me, { current: "clave-vieja-123", next: "clave-nueva-456", confirm: "otra-cosa-789" })).rejects.toThrow();
    await changeOwnPassword(db, me, { current: "clave-vieja-123", next: "clave-nueva-456", confirm: "clave-nueva-456" });
    const [acc] = await db.select().from(accounts).where(eq(accounts.userId, u.id));
    expect(await verifyPassword(acc.password!, "clave-nueva-456")).toBe(true);
    expect((await db.select().from(sessions).where(eq(sessions.userId, u.id))).map((s) => s.id)).toEqual([current]);
  });
});
