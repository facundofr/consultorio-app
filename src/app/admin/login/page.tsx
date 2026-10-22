import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Ingresar al panel", robots: { index: false } };

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  if (await getActor()) redirect("/admin");
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-lg font-bold text-primary">Turnos IA</p>
        <h1 className="text-2xl font-bold tracking-tight">Panel de la clínica</h1>
        <p className="mb-6 mt-1 text-muted-foreground">Ingresá con tu cuenta del equipo.</p>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
