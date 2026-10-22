import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Sacá tu turno médico</h1>
        <p className="max-w-prose text-lg text-muted-foreground">
          Elegí especialidad, profesional y uno de los horarios libres. Te confirmamos al instante y podés cancelarlo online hasta 24 horas antes.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/reservar">Reservar un turno</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/turno">Ver o cancelar mi turno</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
