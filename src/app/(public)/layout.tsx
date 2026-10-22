import Link from "next/link";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">
        Ir al contenido
      </a>
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold text-primary">
            <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
              <rect x="3" y="5" width="18" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <circle cx="12" cy="15.5" r="2.5" fill="var(--sol)" />
            </svg>
            Turnos IA
          </Link>
          <nav aria-label="Principal" className="flex items-center gap-1 text-sm font-semibold">
            <Link href="/reservar" className="rounded-md px-3 py-2 hover:bg-muted">Reservar</Link>
            <Link href="/turno" className="rounded-md px-3 py-2 hover:bg-muted">Mi turno</Link>
          </nav>
        </div>
      </header>
      <main id="contenido" className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 sm:py-12">
        {children}
      </main>
      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted-foreground">
          <Link href="/privacidad" className="underline-offset-4 hover:underline">Privacidad y datos personales</Link>
          <span>Ante una emergencia llamá al 911.</span>
        </div>
      </footer>
    </div>
  );
}
