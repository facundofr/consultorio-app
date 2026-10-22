"use client";

import { useEffect, useState } from "react";
import { staffSlotsAction, type SlotOption } from "@/app/admin/_actions/appointments";
import { cn } from "@/lib/utils";

const PERIODS = [
  { label: "Mañana", test: (t: string) => t < "13:00" },
  { label: "Tarde", test: (t: string) => t >= "13:00" && t < "19:00" },
  { label: "Noche", test: (t: string) => t >= "19:00" },
];

/** Real free slots for one day; the chosen one is highlighted in "sol". */
export function SlotPicker({
  professionalId,
  serviceId,
  locationId,
  date,
  value,
  onChange,
  preferredTime,
  excludeAppointmentId,
  locationNames,
}: {
  professionalId: string;
  serviceId: string;
  locationId: string | null;
  date: string;
  value: SlotOption | null;
  onChange: (s: SlotOption | null) => void;
  preferredTime?: string;
  excludeAppointmentId?: string;
  locationNames: Record<string, string>;
}) {
  const ready = !!(professionalId && serviceId && date);
  const queryKey = [professionalId, serviceId, locationId ?? "", date, excludeAppointmentId ?? ""].join("|");
  const [state, setState] = useState<{ key: string; slots: SlotOption[]; message?: string } | null>(null);

  useEffect(() => {
    let alive = true;
    if (!ready) return;
    staffSlotsAction({ professionalId, serviceId, locationId, date, excludeAppointmentId }).then((r) => {
      if (!alive) return;
      setState({ key: queryKey, slots: r.slots, message: r.message });
      const pre = preferredTime ? r.slots.find((s) => s.localTime === preferredTime) : undefined;
      onChange(pre ?? null);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  if (!ready) return null;
  if (!state || state.key !== queryKey) return <p className="text-sm text-muted-foreground" aria-live="polite">Buscando horarios libres…</p>;
  if (state.message) return <p className="text-sm text-destructive">{state.message}</p>;
  if (state.slots.length === 0) return <p className="text-sm text-muted-foreground" aria-live="polite">No hay horarios libres ese día.</p>;

  const multiLoc = new Set(state.slots.map((s) => s.locationId)).size > 1;
  return (
    <div className="flex flex-col gap-3" role="group" aria-label="Horarios libres">
      {PERIODS.map((p) => {
        const list = state.slots.filter((s) => p.test(s.localTime));
        if (!list.length) return null;
        return (
          <div key={p.label} className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold text-muted-foreground">{p.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {list.map((s) => {
                const selected = value?.startsAt === s.startsAt && value.locationId === s.locationId;
                return (
                  <button
                    key={s.startsAt + s.locationId}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onChange(selected ? null : s)}
                    className={cn(
                      "rounded-md border bg-card px-2.5 py-1.5 text-sm font-semibold tabular-nums hover:border-primary",
                      selected && "border-tinta bg-sol text-tinta hover:border-tinta",
                    )}
                  >
                    {s.localTime}
                    {multiLoc ? <span className="ml-1 font-normal text-muted-foreground">{locationNames[s.locationId]}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
