import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmailStatusBadge } from "@/components/admin/email-status-badge";
import { PageHeader, Section } from "@/components/admin/page-header";
import { utcToLocal } from "@/lib/time";
import { EMAIL_KIND_LABELS, getEmail } from "@/server/admin/emails";
import { can } from "@/server/auth/rbac";
import { adminContext } from "../../../_lib/context";
import { loadOr404 } from "../../../_lib/load";
import { RetryEmailButton } from "./retry-button";

export const metadata: Metadata = { title: "Email" };

export default async function EmailPage({ params }: PageProps<"/admin/emails/[id]">) {
  const { db, actor } = await adminContext();
  if (!can(actor, "read", "emails")) notFound();
  const { id } = await params;
  const e = await loadOr404(() => getEmail(db, actor, id));
  const fmt = (d: Date | null) => {
    if (!d) return "—";
    const l = utcToLocal(d, e.timezone);
    return `${l.date.split("-").reverse().join("/")} ${l.time}`;
  };

  return (
    <>
      <PageHeader
        title={EMAIL_KIND_LABELS[e.kind]}
        description={e.subjectPreview}
        actions={e.status === "failed" && e.payload && can(actor, "write", "emails") ? <RetryEmailButton id={e.id} /> : null}
      />
      <Section title="Envío">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">Estado</dt>
          <dd><EmailStatusBadge status={e.status} /></dd>
          <dt className="text-muted-foreground">Creado</dt>
          <dd className="tabular-nums">{fmt(e.createdAt)}</dd>
          <dt className="text-muted-foreground">Enviado</dt>
          <dd className="tabular-nums">{fmt(e.sentAt)}</dd>
          <dt className="text-muted-foreground">Intentos</dt>
          <dd className="tabular-nums">{e.attempts}</dd>
          {e.lastError ? (
            <>
              <dt className="text-muted-foreground">Último error</dt>
              <dd className="break-words font-mono text-xs">{e.lastError}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Turno</dt>
          <dd>
            {e.appointmentId && e.appointmentCode ? (
              <Link href={`/admin/turnos/${e.appointmentId}`} className="underline-offset-4 hover:underline">{e.appointmentCode}</Link>
            ) : (
              "—"
            )}
          </dd>
        </dl>
      </Section>
      <Section title="Contenido" description="Así lo ve el paciente. Se borra una vez enviado (o a los 7 días, si quedó en la bandeja de prueba).">
        {e.payload ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              Para: <span className="font-semibold">{e.payload.to}</span>
            </p>
            {/* sandbox="" : no scripts, no forms, no navigation from inside the preview. */}
            <iframe title="Vista previa del email" sandbox="" srcDoc={e.payload.html} className="h-[42rem] w-full max-w-[640px] rounded-lg border bg-white" />
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold">Versión en texto</summary>
              <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-muted p-3 font-mono text-xs">{e.payload.text}</pre>
            </details>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">El contenido ya no se guarda.</p>
        )}
      </Section>
    </>
  );
}
