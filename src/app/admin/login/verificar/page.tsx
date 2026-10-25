import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getActor, getPendingTwoFactor } from "@/server/auth/session";
import { logoutAction } from "../../_actions/session";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Código de verificación", robots: { index: false } };

export default async function VerifyPage({ searchParams }: PageProps<"/admin/login/verificar">) {
  if (await getActor()) redirect("/admin");
  const pending = await getPendingTwoFactor();
  if (!pending) redirect("/admin/login");
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-lg font-bold text-primary">Turnos IA</p>
        <h1 className="text-2xl font-bold tracking-tight">Código de verificación</h1>
        <p className="mb-6 mt-1 text-muted-foreground">
          Abrí la app de autenticación de tu celular e ingresá el código de 6 números de <span className="font-semibold text-foreground">Turnos IA</span>.
        </p>
        <VerifyForm next={next} />
        <form action={logoutAction} className="mt-4">
          <Button type="submit" variant="ghost" className="w-full">Cancelar e ingresar con otra cuenta</Button>
        </form>
      </div>
    </main>
  );
}
