import { Trash2 } from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { addDays, utcToLocal } from "@/lib/time";

export type ExceptionItem = {
  id: string;
  kind: "block" | "extra";
  scope: "clinic" | "location" | "professional";
  startsAt: Date;
  endsAt: Date;
  reason: string | null;
  where: string;
};

const DATE_FMT = (d: string) => {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

/** "02/11/2026" or "02/11/2026 09:00 → 03/11/2026 13:00" in clinic time. */
export function describeRange(startsAt: Date, endsAt: Date, tz: string) {
  const s = utcToLocal(startsAt, tz);
  const e = utcToLocal(endsAt, tz);
  const fullDays = s.time === "00:00" && e.time === "00:00";
  if (fullDays) {
    const lastDay = addDays(e.date, -1);
    return lastDay === s.date ? `${DATE_FMT(s.date)}, todo el día` : `Del ${DATE_FMT(s.date)} al ${DATE_FMT(lastDay)}`;
  }
  return s.date === e.date ? `${DATE_FMT(s.date)}, ${s.time} a ${e.time}` : `${DATE_FMT(s.date)} ${s.time} → ${DATE_FMT(e.date)} ${e.time}`;
}

export function ExceptionList({
  items,
  tz,
  canDelete,
  deleteAction,
  emptyText = "No hay bloqueos ni horarios extra próximos.",
}: {
  items: ExceptionItem[];
  tz: string;
  canDelete: boolean;
  deleteAction: (fd: FormData) => Promise<{ ok?: boolean; message?: string }>;
  emptyText?: string;
}) {
  if (items.length === 0) return <p className="text-muted-foreground">{emptyText}</p>;
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {items.map((x) => (
        <li key={x.id} className="flex items-center gap-3 px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold tabular-nums">{describeRange(x.startsAt, x.endsAt, tz)}</span>
              {x.kind === "extra" ? <Badge>Horario extra</Badge> : <Badge variant="warning">Bloqueo</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {x.reason ?? "Sin motivo"}. {x.where}
            </p>
          </div>
          {canDelete ? (
            <ConfirmAction
              trigger={<Button variant="ghost" size="icon-sm" aria-label="Eliminar"><Trash2 /></Button>}
              title="¿Eliminar esta excepción?"
              description={x.kind === "block" ? "Esos horarios vuelven a quedar disponibles para reservar." : "Esos horarios dejan de estar disponibles (los turnos ya tomados se mantienen)."}
              confirmLabel="Eliminar"
              action={deleteAction}
            >
              <input type="hidden" name="id" value={x.id} />
            </ConfirmAction>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
