"use server";

import { getDb } from "@/db/client";
import { normalizeAppointmentCode } from "@/lib/codes";
import { cancelPublic, findAppointmentPublic, type SecondFactor } from "@/server/booking/public";
import { toClientView } from "@/server/booking/view";
import type { ClientAppointmentView } from "@/components/public/appointment-details";
import { isDomainError } from "@/server/errors";
import { rateLimit } from "@/server/security/rate-limit";
import { clientIpHash } from "@/server/security/request";

export type LookupState = {
  error?: string;
  view?: ClientAppointmentView;
  /** Echo of what the patient typed, needed to confirm a cancellation. */
  code?: string;
  contact?: string;
};

function factorFrom(contact: string): SecondFactor {
  const c = contact.trim();
  return c.includes("@") ? { email: c } : { phone: c };
}

async function limited(code: string | null) {
  const ip = await clientIpHash();
  const a = await rateLimit(`lookup:ip:${ip}`, 15, 15 * 60_000);
  const b = code ? await rateLimit(`lookup:code:${code}`, 8, 60 * 60_000) : { ok: true };
  return !a.ok || !b.ok;
}

export async function lookupAction(_: LookupState, fd: FormData): Promise<LookupState> {
  const code = String(fd.get("code") ?? "").slice(0, 20);
  const contact = String(fd.get("contact") ?? "").slice(0, 200);
  if (!code.trim() || !contact.trim()) return { error: "Completá el código del turno y tu teléfono o email.", code, contact };
  if (await limited(normalizeAppointmentCode(code))) return { error: "Hiciste muchos intentos. Esperá unos minutos o llamá a la clínica.", code, contact };
  try {
    const v = await findAppointmentPublic(getDb(), code, factorFrom(contact));
    return { view: toClientView(v), code, contact };
  } catch (e) {
    if (isDomainError(e)) return { error: e.userMessage, code, contact };
    throw e;
  }
}

export type CancelResult = { ok: boolean; message: string; view?: ClientAppointmentView };

async function doCancel(code: string, factor: SecondFactor, channel: "link" | "form"): Promise<CancelResult> {
  if (await limited(normalizeAppointmentCode(code))) return { ok: false, message: "Hiciste muchos intentos. Esperá unos minutos o llamá a la clínica." };
  try {
    const v = await cancelPublic(getDb(), code, factor, channel);
    return { ok: true, message: "Listo, tu turno quedó cancelado.", view: toClientView(v) };
  } catch (e) {
    if (isDomainError(e)) return { ok: false, message: e.userMessage };
    throw e;
  }
}

export async function cancelWithTokenAction(code: string, token: string): Promise<CancelResult> {
  return doCancel(code, { token }, "link");
}

export async function cancelWithContactAction(code: string, contact: string): Promise<CancelResult> {
  return doCancel(code, factorFrom(contact), "form");
}
