"use client";

import { LogIn, Phone, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { TabBar, type Tab } from "@/components/tab-bar";
import { ThemeToggle } from "@/components/theme";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export function PublicTabBar({ assistant }: { assistant: boolean }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const second: Tab = assistant
    ? { href: "/asistente", match: "/asistente", label: "Asistente", icon: "chat" }
    : { href: "/privacidad", label: "Privacidad", icon: "shield" };

  return (
    <>
      <TabBar
        hideFrom="md"
        left={[{ href: "/", label: "Inicio", icon: "house" }, second]}
        center={{ href: "/reservar", match: "/reservar", label: "Reservar", icon: "calendarPlus" }}
        right={[{ href: "/turno", match: "/turno", label: "Mi turno", icon: "ticket" }]}
        onMore={() => setOpen(true)}
        moreOpen={open}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent side="bottom" aria-describedby={undefined} className="md:hidden">
          <DialogTitle className="text-lg font-bold">Más opciones</DialogTitle>
          <ul className="flex flex-col divide-y rounded-xl border bg-card">
            <li>
              <Link href="/privacidad" onClick={close} className="flex min-h-14 items-center gap-3 px-4">
                <ShieldCheck className="size-5 text-primary" aria-hidden /> Privacidad y datos personales
              </Link>
            </li>
            <li>
              <Link href="/admin/login" onClick={close} className="flex min-h-14 items-center gap-3 px-4">
                <LogIn className="size-5 text-primary" aria-hidden /> Ingreso del equipo de la clínica
              </Link>
            </li>
          </ul>
          <ThemeToggle className="h-12 w-full justify-start rounded-xl border bg-card px-4 text-base text-foreground" />
          <div className="flex flex-col gap-2 rounded-xl bg-alerta-claro p-4">
            <p className="font-bold text-destructive">¿Es una emergencia?</p>
            <div className="flex flex-wrap gap-2">
              <a href="tel:911" className="inline-flex h-12 items-center gap-2 rounded-lg bg-destructive px-5 font-semibold text-destructive-foreground">
                <Phone className="size-5" aria-hidden /> Llamar al 911
              </a>
              <a href="tel:107" className="inline-flex h-12 items-center gap-2 rounded-lg border border-destructive bg-card px-5 font-semibold text-destructive">
                <Phone className="size-5" aria-hidden /> SAME 107
              </a>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
