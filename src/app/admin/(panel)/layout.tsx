import type { Metadata } from "next";
import { AdminSidebar, type NavGroup } from "@/components/admin/nav";
import { Toaster } from "@/components/ui/sonner";
import { getDb } from "@/db/client";
import { listClinics } from "@/server/admin/clinics";
import { can, ROLE_LABELS } from "@/server/auth/rbac";
import { requireAdminContext } from "@/server/auth/session";
import { logoutAction, switchClinicAction } from "../_actions/session";

export const metadata: Metadata = { title: { default: "Panel", template: "%s · Panel · Turnos IA" }, robots: { index: false } };

export default async function PanelLayout({ children }: LayoutProps<"/admin">) {
  const { actor, clinicId } = await requireAdminContext();
  const clinics = await listClinics(getDb(), actor);

  const groups: NavGroup[] = [
    {
      items: [
        { href: "/admin", label: "Inicio", icon: "house" },
        { href: "/admin/agenda", label: "Agenda", icon: "calendar" },
        { href: "/admin/turnos", label: "Turnos", icon: "list" },
        { href: "/admin/pacientes", label: "Pacientes", icon: "users" },
      ],
    },
    {
      label: "Atención",
      items: [
        { href: "/admin/profesionales", label: "Profesionales y horarios", icon: "stethoscope" },
        { href: "/admin/excepciones", label: "Feriados y bloqueos", icon: "off" },
        { href: "/admin/sedes", label: "Sedes", icon: "pin" },
        { href: "/admin/especialidades", label: "Especialidades", icon: "pulse" },
        { href: "/admin/servicios", label: "Tipos de consulta", icon: "clipboard" },
        { href: "/admin/faq", label: "Preguntas frecuentes", icon: "book" },
      ],
    },
    {
      label: "Clínica",
      items: [
        ...(can(actor, "read", "settings") ? [{ href: "/admin/ajustes", label: "Ajustes", icon: "settings" as const }] : []),
        ...(actor.role === "superadmin" ? [{ href: "/admin/clinicas", label: "Clínicas", icon: "building" as const }] : []),
        ...(can(actor, "read", "users") ? [{ href: "/admin/usuarios", label: "Usuarios", icon: "usercog" as const }] : []),
        ...(can(actor, "read", "conversations") ? [{ href: "/admin/conversaciones", label: "Conversaciones", icon: "chat" as const }] : []),
        ...(can(actor, "read", "audit") ? [{ href: "/admin/auditoria", label: "Auditoría", icon: "history" as const }] : []),
      ],
    },
  ];

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <AdminSidebar
        groups={groups}
        user={{ name: actor.name, roleLabel: ROLE_LABELS[actor.role] }}
        clinics={clinics.map((c) => ({ id: c.id, name: c.name }))}
        activeClinicId={clinicId}
        switchClinic={switchClinicAction}
        logout={logoutAction}
      />
      <main id="contenido" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        {clinicId || actor.role === "superadmin" ? children : <p>Tu usuario no tiene una clínica asignada. Pedile a un administrador que la configure.</p>}
      </main>
      <Toaster />
    </div>
  );
}
