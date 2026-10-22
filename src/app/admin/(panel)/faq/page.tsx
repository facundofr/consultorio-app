import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SearchForm } from "@/components/admin/list-controls";
import { EmptyState, PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listKbDocs } from "@/server/admin/catalog";
import { can } from "@/server/auth/rbac";
import { adminContext, param } from "../../_lib/context";

export const metadata: Metadata = { title: "Preguntas frecuentes" };

export default async function FaqPage({ searchParams }: PageProps<"/admin/faq">) {
  const { db, actor, clinicId } = await adminContext();
  const q = param(await searchParams, "q");
  const rows = await listKbDocs(db, actor, clinicId, { q, includeInactive: true });
  const canWrite = can(actor, "write", "catalog");
  return (
    <>
      <PageHeader
        title="Preguntas frecuentes"
        description="Es la única fuente que usa el asistente para responder preguntas generales. Si algo no está acá, el asistente ofrece el contacto de la clínica."
        actions={canWrite ? <Button asChild><Link href="/admin/faq/nueva"><Plus /> Nueva pregunta</Link></Button> : null}
      />
      <SearchForm q={q} placeholder="Pregunta o respuesta" />
      {rows.length === 0 ? (
        <EmptyState title="No hay preguntas para mostrar." />
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/admin/faq/${r.id}`} className="font-semibold underline-offset-4 hover:underline">{r.question}</Link>
                {!r.active ? <Badge variant="muted">No publicada</Badge> : null}
              </div>
              <p className="line-clamp-2 max-w-prose text-sm text-muted-foreground">{r.answer}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
