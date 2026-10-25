"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { ZodError } from "zod";
import { getDb } from "@/db/client";
import { changeOwnPassword } from "@/server/admin/users";
import { requireActor, requireSignedIn } from "@/server/auth/session";
import {
  beginTwoFactorSetup,
  confirmTwoFactorSetup,
  disableOwnTwoFactor,
  regenerateBackupCodes,
  resetTwoFactor,
} from "@/server/auth/two-factor";
import { isDomainError } from "@/server/errors";
import { runSimple, type ActionState } from "../_lib/action";

type Fail = { ok: false; error: string };
const fail = (e: unknown): Fail => {
  if (isDomainError(e)) return { ok: false, error: e.userMessage };
  if (e instanceof ZodError) return { ok: false, error: e.issues[0]?.message ?? "Revisá los datos." };
  console.error("[account] unexpected error:", e instanceof Error ? e.message : "unknown");
  return { ok: false, error: "Algo falló. Probá de nuevo." };
};

export async function startTwoFactorSetupAction(): Promise<{ ok: true; secret: string; qr: string } | Fail> {
  const actor = await requireSignedIn();
  try {
    const { secret, uri } = await beginTwoFactorSetup(getDb(), actor.id);
    const qr = await QRCode.toDataURL(uri, { margin: 1, width: 240, errorCorrectionLevel: "M" });
    return { ok: true, secret, qr };
  } catch (e) {
    return fail(e);
  }
}

export async function confirmTwoFactorSetupAction(code: string): Promise<{ ok: true; codes: string[] } | Fail> {
  const actor = await requireSignedIn();
  try {
    const codes = await confirmTwoFactorSetup(getDb(), actor.id, actor.sessionId!, String(code).slice(0, 10));
    return { ok: true, codes };
  } catch (e) {
    return fail(e);
  }
}

export async function regenerateBackupCodesAction(code: string): Promise<{ ok: true; codes: string[] } | Fail> {
  const actor = await requireSignedIn();
  try {
    return { ok: true, codes: await regenerateBackupCodes(getDb(), actor, String(code).slice(0, 10)) };
  } catch (e) {
    return fail(e);
  }
}

export async function disableTwoFactorAction(code: string): Promise<{ ok: true } | Fail> {
  const actor = await requireSignedIn();
  try {
    await disableOwnTwoFactor(getDb(), actor, String(code).slice(0, 10));
    revalidatePath("/admin/seguridad");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requireSignedIn();
  return runSimple(async () => {
    await changeOwnPassword(getDb(), actor, {
      current: String(fd.get("current") ?? ""),
      next: String(fd.get("next") ?? ""),
      confirm: String(fd.get("confirm") ?? ""),
    });
    return "Listo: cambiaste tu contraseña. Cerramos tus otras sesiones abiertas.";
  });
}

/** Administration removes another user's two-factor (lost phone). */
export async function resetUserTwoFactorAction(userId: string) {
  const actor = await requireActor();
  const res = await runSimple(async () => {
    await resetTwoFactor(getDb(), actor, userId);
    return "Listo: se quitó el doble factor y se cerraron sus sesiones.";
  });
  if (res.ok) revalidatePath(`/admin/usuarios/${userId}`);
  return res;
}
