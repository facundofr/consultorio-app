import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** GET search form: works without JavaScript, keeps state in the URL. */
export function SearchForm({
  q,
  placeholder = "Buscar…",
  label = "Buscar",
  children,
}: {
  q?: string;
  placeholder?: string;
  label?: string;
  children?: ReactNode;
}) {
  return (
    <form role="search" method="get" className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="flex min-w-56 flex-1 flex-col gap-1.5">
        <Label htmlFor="q">{label}</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id="q" name="q" type="search" defaultValue={q} placeholder={placeholder} className="pl-9" />
        </div>
      </div>
      {children}
      <Button type="submit" variant="outline">
        Buscar
      </Button>
    </form>
  );
}

export function Pagination({ page, total, pageSize, params }: { page: number; total: number; pageSize: number; params: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return <p className="mt-3 text-sm text-muted-foreground">{total} resultado{total === 1 ? "" : "s"}</p>;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set("page", String(p));
    return `?${sp.toString()}`;
  };
  return (
    <nav aria-label="Paginación" className="mt-3 flex items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground">
        {total} resultados · página {page} de {pages}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page - 1)}>
              <ChevronLeft /> Anterior
            </Link>
          </Button>
        ) : null}
        {page < pages ? (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page + 1)}>
              Siguiente <ChevronRight />
            </Link>
          </Button>
        ) : null}
      </div>
    </nav>
  );
}
