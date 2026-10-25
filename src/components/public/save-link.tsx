"use client";

import { Check, Copy, MessageCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Until confirmation emails exist, the link on screen is the patient's only
 * copy: make saving it obvious (copy, or send it to yourself by WhatsApp).
 */
export function SaveLink({ code, path, summary }: { code: string; path: string; summary: string }) {
  const [copied, setCopied] = useState(false);
  const url = () => new URL(path, window.location.origin).toString();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url());
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      window.prompt("Copiá este enlace:", url());
    }
  };
  const whatsapp = () => {
    const text = `Mi turno ${code}: ${summary}. Para verlo o cancelarlo: ${url()}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <section aria-labelledby="guardar-titulo" className="mb-6 flex flex-col gap-3 rounded-xl border-2 border-sol bg-sol-claro p-4">
      <h2 id="guardar-titulo" className="text-lg font-bold">Guardá este enlace</h2>
      <p>
        Con él podés ver tu turno, agregarlo al calendario o cancelarlo. También te lo mandamos por email. Si lo perdés, buscalo en «Mi turno» con el código{" "}
        <span className="font-bold tabular-nums">{code}</span> y tu teléfono o email.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button type="button" size="lg" onClick={copy} aria-live="polite">
          {copied ? <Check /> : <Copy />} {copied ? "¡Copiado!" : "Copiar enlace"}
        </Button>
        <Button type="button" size="lg" variant="outline" onClick={whatsapp}>
          <MessageCircle /> Enviármelo por WhatsApp
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">Compartilo solo con quien quieras que pueda cancelar el turno.</p>
    </section>
  );
}
