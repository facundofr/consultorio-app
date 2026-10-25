import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import { AppointmentDetails, CalendarLink } from "@/components/public/appointment-details";
import { SaveLink } from "@/components/public/save-link";
import { StepHeading } from "@/components/public/wizard-ui";
import { getDb } from "@/db/client";
import { findAppointmentPublic } from "@/server/booking/public";
import { toClientView } from "@/server/booking/view";
import { isDomainError } from "@/server/errors";
import { rateLimit } from "@/server/security/rate-limit";
import { clientIpHash } from "@/server/security/request";
import { cancelWithTokenAction } from "../actions";
import { CancelPanel } from "../cancel-panel";
import { Lookup } from "../lookup";

export const metadata: Metadata = { title: "Tu turno", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AppointmentByLinkPage({ params, searchParams }: PageProps<"/turno/[code]">) {
  const { code } = await params;
  const sp = await searchParams;
  const token = typeof sp.t === "string" ? sp.t : undefined;
  const isNew = sp.nuevo === "1";

  if (!token) {
    return (
      <>
        <StepHeading title="Ver o cancelar tu turno">Para ver el turno {code.toUpperCase()}, confirmá el teléfono o el email que usaste al reservar.</StepHeading>
        <Lookup initialCode={code} />
      </>
    );
  }

  let view;
  try {
    if (!(await rateLimit(`link:${await clientIpHash()}`, 60, 15 * 60_000)).ok) throw new Error("rate");
    view = toClientView(await findAppointmentPublic(getDb(), code, { token }));
  } catch (e) {
    const msg = isDomainError(e) ? "El enlace no es válido o venció. Buscá tu turno con el código y tu teléfono o email." : "Hiciste muchos intentos. Esperá unos minutos.";
    return (
      <>
        <StepHeading title="No encontramos el turno">{msg}</StepHeading>
        <Lookup initialCode={code} />
      </>
    );
  }

  return (
    <>
      {isNew && view.status === "confirmed" ? (
        <div className="mb-6 flex items-start gap-3" role="status">
          <CheckCircle2 className="mt-1 size-7 shrink-0 text-primary" aria-hidden />
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">¡Listo, {view.patientFirstName}! Tu turno está confirmado</h1>
            <p className="text-muted-foreground">Código <span className="font-semibold text-foreground">{view.code}</span>.</p>
          </div>
        </div>
      ) : (
        <StepHeading title="Tu turno" />
      )}
      {isNew && view.status === "confirmed" ? (
        <SaveLink
          code={view.code}
          path={`/turno/${view.code}?t=${encodeURIComponent(token)}`}
          summary={`${view.when}, ${view.professionalName}, ${view.location.name}`}
        />
      ) : null}
      <AppointmentDetails
        view={view}
        actions={
          <>
            {view.status === "confirmed" ? (
              <div className="flex flex-wrap gap-3">
                <CalendarLink href={`/turno/${view.code}/calendario?t=${encodeURIComponent(token)}`} />
              </div>
            ) : null}
            <CancelPanel view={view} cancel={cancelWithTokenAction.bind(null, view.code, token)} />
          </>
        }
      />
    </>
  );
}
