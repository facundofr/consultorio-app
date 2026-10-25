import { ArrowLeft, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { ROLE_LABELS } from "@/server/auth/rbac";
import { requireSignedIn } from "@/server/auth/session";
import { twoFactorRequired } from "@/server/auth/two-factor";
import { logoutAction } from "../_actions/session";
import { PasswordForm, TwoFactorPanel } from "./security-panels";

export const metadata: Metadata = { title: "Mi cuenta y seguridad · Panel · Turnos IA", robots: { index: false } };

/**
 * Outside the panel layout on purpose: users whose role requires two-factor
 * land here before they can use anything else (see requireActor).
 */
export default async function SecurityPage({ searchParams }: PageProps<"/admin/seguridad">) {
  const actor = await requireSignedIn();
  const sp = await searchParams;
  const [u] = await getDb()
    .select({ totpEnabledAt: users.totpEnabledAt, backupCodeHashes: users.backupCodeHashes })
    .from(users)
    .where(eq(users.id, actor.id));
  const required = twoFactorRequired(actor.role);
  const enabled = !!u?.totpEnabledAt;
  const mustSetUp = required && !enabled;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        {mustSetUp ? (
          <p className="text-lg font-bold text-primary">Turnos IA</p>
        ) : (
          <Button asChild variant="ghost" className="-ml-3">
            <Link href="/admin"><ArrowLeft /> Volver al panel</Link>
          </Button>
        )}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <form action={logoutAction}>
            <Button type="submit" variant="outline" size="sm">Salir</Button>
          </form>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mi cuenta y seguridad</h1>
        <p className="mt-1 text-muted-foreground">
          {actor.name} · {actor.email} · {ROLE_LABELS[actor.role]}
        </p>
      </div>

      {mustSetUp || sp.obligatorio ? (
        <p role="status" className="flex gap-3 rounded-lg border-2 border-sol bg-sol-claro px-4 py-3 text-tinta">
          <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
          <span>
            <strong>Tu rol requiere doble factor.</strong> Configuralo una vez con la app de autenticación de tu celular y vas a poder usar el panel.
          </span>
        </p>
      ) : null}

      <section aria-labelledby="dosfa" className="flex flex-col gap-3 rounded-xl border bg-card p-5">
        <h2 id="dosfa" className="text-lg font-bold">Doble factor</h2>
        <p className="text-sm text-muted-foreground">
          Además de la contraseña, al ingresar te vamos a pedir un código de 6 números que genera una app en tu celular (Google Authenticator, Microsoft Authenticator, 1Password, Aegis…). Así, si alguien consigue tu contraseña, igual no puede entrar.
        </p>
        <TwoFactorPanel enabled={enabled} required={required} backupCodesLeft={u?.backupCodeHashes?.length ?? 0} />
      </section>

      <section aria-labelledby="clave" className="flex flex-col gap-3 rounded-xl border bg-card p-5">
        <h2 id="clave" className="text-lg font-bold">Cambiar contraseña</h2>
        <PasswordForm />
      </section>
    </main>
  );
}
