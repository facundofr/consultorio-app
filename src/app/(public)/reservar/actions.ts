"use server";

import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { getDb } from "@/db/client";
import { bookPublic } from "@/server/booking/public";
import { PatientInput } from "@/server/patients/service";
import { isDomainError } from "@/server/errors";
import { rateLimit } from "@/server/security/rate-limit";
import { clientIpHash } from "@/server/security/request";

export type BookState = {
  error?: string;
  slotGone?: boolean;
  fieldErrors?: Partial<Record<"fullName" | "phone" | "email" | "consent", string>>;
  values?: { fullName: string; phone: string; email: string; consent: boolean };
  seq?: number;
};

export async function bookAction(
  slot: { professionalId: string; locationId: string; serviceId: string; startsAt: string },
  _: BookState,
  fd: FormData,
): Promise<BookState> {
  const values = {
    fullName: String(fd.get("fullName") ?? "").slice(0, 200),
    phone: String(fd.get("phone") ?? "").slice(0, 60),
    email: String(fd.get("email") ?? "").slice(0, 200),
    consent: fd.get("consent") === "on",
  };
  // Honeypot: real people never fill this hidden field.
  if (String(fd.get("website") ?? "")) return { error: "No pudimos procesar la reserva.", values, seq: Date.now() };

  const fieldErrors: BookState["fieldErrors"] = {};
  const parsed = PatientInput.safeParse({ fullName: values.fullName, phone: values.phone, email: values.email });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as "fullName" | "phone" | "email";
      fieldErrors[key] ??= issue.message;
    }
  }
  if (!values.consent) fieldErrors.consent = "Para reservar necesitamos que aceptes el uso de tus datos.";
  if (Object.keys(fieldErrors).length) return { error: "Revisá los datos marcados.", fieldErrors, values, seq: Date.now() };

  const limit = rateLimit(`book:${await clientIpHash()}`, 10, 60 * 60_000);
  if (!limit.ok) return { error: "Hiciste muchas reservas seguidas. Probá de nuevo en un rato o llamá a la clínica.", values, seq: Date.now() };

  let target: string | null = null;
  try {
    const { appointment, cancelToken } = await bookPublic(
      getDb(),
      { ...slot, patient: { fullName: values.fullName, phone: values.phone, email: values.email }, consent: true },
      { source: "form" },
    );
    target = `/turno/${appointment.code}?t=${encodeURIComponent(cancelToken)}&nuevo=1`;
  } catch (e) {
    if (e instanceof ZodError) return { error: "No pudimos validar la reserva. Elegí el horario de nuevo.", slotGone: true, values, seq: Date.now() };
    if (isDomainError(e)) {
      const gone = e.code === "SLOT_TAKEN" || e.code === "SLOT_UNAVAILABLE";
      return { error: e.userMessage, slotGone: gone, fieldErrors, values, seq: Date.now() };
    }
    console.error("[booking] unexpected error:", e instanceof Error ? e.message : "unknown");
    return { error: "No pudimos confirmar el turno. Probá de nuevo en unos segundos.", values, seq: Date.now() };
  }
  redirect(target);
}
