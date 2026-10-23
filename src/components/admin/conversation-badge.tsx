import { Badge } from "@/components/ui/badge";
import type { conversationStatus } from "@/db/schema";

export type ConversationStatus = (typeof conversationStatus.enumValues)[number];

export const CONVERSATION_STATUS_LABELS: Record<ConversationStatus, string> = {
  active: "En curso",
  booked: "Reservó",
  urgent: "Posible urgencia",
  limited: "Límite de uso",
  abandoned: "Sin terminar",
};

export function ConversationBadge({ status }: { status: ConversationStatus }) {
  const variant =
    status === "booked" ? "solid" : status === "urgent" ? "danger" : status === "limited" ? "warning" : status === "abandoned" ? "muted" : "default";
  return <Badge variant={variant}>{CONVERSATION_STATUS_LABELS[status]}</Badge>;
}
