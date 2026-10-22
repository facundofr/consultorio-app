"use client";

import {
  BookOpen,
  Building2,
  CalendarDays,
  CalendarOff,
  ClipboardList,
  HeartPulse,
  History,
  House,
  ListChecks,
  LogOut,
  MapPin,
  Menu,
  MessagesSquare,
  Settings,
  Stethoscope,
  UserCog,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const ICONS = {
  house: House,
  calendar: CalendarDays,
  list: ListChecks,
  users: Users,
  stethoscope: Stethoscope,
  off: CalendarOff,
  pin: MapPin,
  pulse: HeartPulse,
  clipboard: ClipboardList,
  book: BookOpen,
  settings: Settings,
  building: Building2,
  usercog: UserCog,
  history: History,
  chat: MessagesSquare,
} as const;

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS };
export type NavGroup = { label?: string; items: NavItem[] };

function NavLinks({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Panel" className="flex flex-col gap-5">
      {groups.map((g, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          {g.label ? <p className="mb-1 px-3 text-xs font-semibold text-muted-foreground">{g.label}</p> : null}
          {g.items.map((it) => {
            const active = it.href === "/admin" ? pathname === "/admin" : pathname.startsWith(it.href);
            const Icon = ICONS[it.icon];
            return (
              <Link
                key={it.href}
                href={it.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-muted hover:text-foreground",
                  active && "bg-secondary font-semibold text-eucalipto-oscuro hover:bg-secondary",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {it.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function ClinicSwitcher({
  clinics,
  activeId,
  action,
}: {
  clinics: { id: string; name: string }[];
  activeId: string | null;
  action: (fd: FormData) => Promise<void>;
}) {
  if (clinics.length <= 1) return clinics[0] ? <p className="px-3 text-sm font-semibold">{clinics[0].name}</p> : null;
  return (
    <form action={action} className="flex flex-col gap-1 px-1">
      <label htmlFor="clinic-switch" className="px-2 text-xs font-semibold text-muted-foreground">
        Clínica
      </label>
      <NativeSelect
        id="clinic-switch"
        name="clinicId"
        defaultValue={activeId ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-9"
      >
        {clinics.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </NativeSelect>
      <noscript>
        <Button type="submit" size="sm" variant="outline">
          Cambiar
        </Button>
      </noscript>
    </form>
  );
}

export function AdminSidebar(props: {
  groups: NavGroup[];
  user: { name: string; roleLabel: string };
  clinics: { id: string; name: string }[];
  activeClinicId: string | null;
  switchClinic: (fd: FormData) => Promise<void>;
  logout: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const body = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Link href="/admin" onClick={onNavigate} className="px-3 text-lg font-bold text-primary">
          Turnos IA
        </Link>
        <ClinicSwitcher clinics={props.clinics} activeId={props.activeClinicId} action={props.switchClinic} />
      </div>
      <NavLinks groups={props.groups} onNavigate={onNavigate} />
      <div className="mt-auto flex flex-col gap-2 border-t pt-4">
        <div className="px-3">
          <p className="text-sm font-semibold">{props.user.name}</p>
          <p className="text-xs text-muted-foreground">{props.user.roleLabel}</p>
        </div>
        <form action={props.logout}>
          <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
            <LogOut /> Cerrar sesión
          </Button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-card px-4 lg:hidden">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Abrir menú">
              <Menu />
            </Button>
          </DialogTrigger>
          <DialogContent side="left" aria-describedby={undefined}>
            <DialogTitle className="sr-only">Menú</DialogTitle>
            {body(() => setOpen(false))}
          </DialogContent>
        </Dialog>
        <span className="font-bold text-primary">Turnos IA</span>
      </header>
      <aside className="hidden w-64 shrink-0 border-r bg-card px-3 py-5 lg:sticky lg:top-0 lg:block lg:h-dvh lg:overflow-y-auto">
        {body()}
      </aside>
    </>
  );
}
