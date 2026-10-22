import { Badge } from "@/components/ui/badge";
import type { AppointmentStatus } from "@/db/schema";

const LABELS: Record<AppointmentStatus, string> = {
  confirmed: "Confirmado",
  cancelled_by_patient: "Canceló el paciente",
  cancelled_by_admin: "Canceló la clínica",
  completed: "Atendido",
  no_show: "Ausente",
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const variant =
    status === "confirmed" ? "default" : status === "completed" ? "muted" : status === "no_show" ? "warning" : "danger";
  return <Badge variant={variant}>{LABELS[status]}</Badge>;
}

export function ActiveBadge({ active }: { active: boolean }) {
  return active ? <Badge variant="default">Activo</Badge> : <Badge variant="muted">Inactivo</Badge>;
}
