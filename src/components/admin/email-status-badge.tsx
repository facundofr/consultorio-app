import { Badge } from "@/components/ui/badge";
import type { EmailStatus } from "@/db/schema";

const LABELS: Record<EmailStatus, string> = {
  pending: "En cola",
  sending: "Enviando",
  sent: "Enviado",
  preview: "Bandeja de prueba",
  failed: "Falló",
};
const VARIANTS: Record<EmailStatus, "default" | "solid" | "muted" | "warning" | "danger"> = {
  pending: "muted",
  sending: "muted",
  sent: "solid",
  preview: "warning",
  failed: "danger",
};

export function EmailStatusBadge({ status }: { status: EmailStatus }) {
  return <Badge variant={VARIANTS[status]}>{LABELS[status]}</Badge>;
}
