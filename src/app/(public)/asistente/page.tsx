import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OptionList, StepHeading } from "@/components/public/wizard-ui";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { assistantConfig } from "@/server/assistant/config";
import { formHrefFor } from "@/server/assistant/tools";
import { getClinicInfo, getClinicPublic, listClinicsPublic } from "@/server/booking/public";
import { isDomainError } from "@/server/errors";
import { Chat } from "./chat";

export const metadata: Metadata = { title: "Asistente de turnos" };

export default async function AssistantPage({ searchParams }: PageProps<"/asistente">) {
  const sp = await searchParams;
  const slug = typeof sp.clinica === "string" ? sp.clinica : undefined;
  const db = getDb();

  if (!assistantConfig().enabled) {
    return (
      <div className="flex flex-col gap-4">
        <StepHeading title="El asistente no está disponible">Podés reservar tu turno con el formulario paso a paso.</StepHeading>
        <div>
          <Button asChild size="lg">
            <Link href={slug ? `/reservar?clinica=${encodeURIComponent(slug)}` : "/reservar"}>Reservar con el formulario</Link>
          </Button>
        </div>
      </div>
    );
  }

  const clinics = await listClinicsPublic(db);
  const chosen = slug ?? (clinics.length === 1 ? clinics[0].slug : undefined);
  if (!chosen) {
    return (
      <>
        <StepHeading title="¿En qué clínica querés atenderte?" />
        <OptionList options={clinics.map((c) => ({ href: `/asistente?clinica=${encodeURIComponent(c.slug)}`, title: c.name, detail: c.phone ?? undefined }))} />
      </>
    );
  }

  let clinic;
  try {
    clinic = await getClinicPublic(db, chosen);
  } catch (e) {
    if (isDomainError(e)) notFound();
    throw e;
  }
  const info = await getClinicInfo(db, clinic.id);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Asistente de turnos</h1>
        <p className="text-muted-foreground">
          {info.name}.{" "}
          {clinics.length > 1 ? (
            <Link href="/asistente" className="text-primary underline underline-offset-4">Cambiar de clínica</Link>
          ) : null}{" "}
          ¿Preferís elegir vos?{" "}
          <Link href={formHrefFor(clinic.slug)} className="text-primary underline underline-offset-4">Usá el formulario</Link>.
        </p>
      </div>
      <noscript>
        <p className="rounded-lg bg-sol-claro px-4 py-3">
          El chat necesita JavaScript. <Link href={formHrefFor(clinic.slug)} className="font-semibold underline">Reservá con el formulario</Link>, que funciona sin él.
        </p>
      </noscript>
      <Chat key={clinic.slug} clinicSlug={clinic.slug} welcome={info.welcomeText} formHref={formHrefFor(clinic.slug)} />
    </div>
  );
}
