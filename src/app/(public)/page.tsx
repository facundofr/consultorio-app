import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { assistantConfig } from "@/server/assistant/config";

export default async function Home() {
  // The assistant can be switched on or off with env vars: decide per request, not at build time.
  await connection();
  const ai = assistantConfig().enabled;
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Sacá tu turno médico</h1>
        <p className="max-w-prose text-lg text-muted-foreground">
          Elegí especialidad, profesional y uno de los horarios libres. Te confirmamos al instante y podés cancelarlo online dentro del plazo de tu clínica (te lo mostramos antes de confirmar).
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/reservar">Reservar un turno</Link>
          </Button>
          {ai ? (
            <Button asChild size="lg" variant="secondary">
              <Link href="/asistente"><MessageCircle /> Hablar con el asistente</Link>
            </Button>
          ) : null}
          <Button asChild size="lg" variant="outline">
            <Link href="/turno">Ver o cancelar mi turno</Link>
          </Button>
        </div>
        {ai ? (
          <p className="max-w-prose text-sm text-muted-foreground">
            El asistente te ayuda a encontrar un horario escribiendo como en un chat. No da consejos médicos y no ve tus datos personales: los cargás en un formulario aparte.
          </p>
        ) : null}
      </section>
    </div>
  );
}
