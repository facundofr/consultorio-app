"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

export type RuleRow = {
  key: string;
  locationId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  validFrom: string;
  validTo: string;
};

let seq = 0;
const newKey = () => `r${Date.now()}-${seq++}`;

export function ScheduleEditor({
  initial,
  locations,
  readOnly,
  save,
}: {
  initial: Omit<RuleRow, "key">[];
  locations: { id: string; name: string }[];
  readOnly?: boolean;
  save: (rules: Omit<RuleRow, "key">[]) => Promise<{ ok?: boolean; message?: string }>;
}) {
  const [rows, setRows] = useState<RuleRow[]>(() => initial.map((r) => ({ ...r, key: newKey() })));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const locName = useMemo(() => Object.fromEntries(locations.map((l) => [l.id, l.name])), [locations]);

  const update = (key: string, patch: Partial<RuleRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = (weekday = 1) =>
    setRows((rs) => [...rs, { key: newKey(), locationId: locations[0]?.id ?? "", weekday, startTime: "09:00", endTime: "13:00", validFrom: "", validTo: "" }]);
  const copyToWeekdays = (r: RuleRow) =>
    setRows((rs) => {
      const extra = [1, 2, 3, 4, 5]
        .filter((d) => d !== r.weekday && !rs.some((x) => x.weekday === d && x.locationId === r.locationId && x.startTime === r.startTime && x.endTime === r.endTime))
        .map((d) => ({ ...r, key: newKey(), weekday: d }));
      return [...rs, ...extra];
    });

  const byDay = DAYS.map((_, i) => rows.filter((r) => r.weekday === i + 1).sort((a, b) => a.startTime.localeCompare(b.startTime)));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" aria-label="Resumen semanal">
        {DAYS.map((d, i) => (
          <div key={d} className="flex min-h-20 flex-col gap-1 rounded-lg border bg-card p-2">
            <p className="text-xs font-semibold text-muted-foreground">{d}</p>
            {byDay[i].length === 0 ? (
              <p className="text-xs text-muted-foreground">No atiende</p>
            ) : (
              byDay[i].map((r) => (
                <p key={r.key} className="rounded bg-secondary px-1.5 py-1 text-xs leading-tight text-eucalipto-oscuro">
                  <span className="font-semibold tabular-nums">{r.startTime}–{r.endTime}</span>
                  <br />
                  {locName[r.locationId] ?? "Sin sede"}
                </p>
              ))
            )}
          </div>
        ))}
      </div>

      {rows.length === 0 ? <p className="text-muted-foreground">Todavía no tiene horario. Agregá la primera franja.</p> : null}

      <fieldset disabled={readOnly || pending} className="flex flex-col gap-3">
        <legend className="sr-only">Franjas horarias</legend>
        {rows.map((r, idx) => (
          <div key={r.key} className="grid grid-cols-2 items-end gap-3 rounded-lg border bg-card p-3 sm:grid-cols-[9rem_1fr_7rem_7rem_auto]">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`d-${r.key}`}>Día</Label>
              <NativeSelect id={`d-${r.key}`} value={r.weekday} onChange={(e) => update(r.key, { weekday: Number(e.target.value) })}>
                {DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`l-${r.key}`}>Sede</Label>
              <NativeSelect id={`l-${r.key}`} value={r.locationId} onChange={(e) => update(r.key, { locationId: e.target.value })}>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`s-${r.key}`}>Desde</Label>
              <Input id={`s-${r.key}`} type="time" step={300} value={r.startTime} onChange={(e) => update(r.key, { startTime: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`e-${r.key}`}>Hasta</Label>
              <Input id={`e-${r.key}`} type="time" step={300} value={r.endTime} onChange={(e) => update(r.key, { endTime: e.target.value })} />
            </div>
            <div className="col-span-2 flex gap-1 sm:col-span-1">
              <Button type="button" variant="ghost" size="sm" onClick={() => copyToWeekdays(r)} title="Copiar esta franja de lunes a viernes">
                Lun a vie
              </Button>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={`Quitar franja ${idx + 1}`}>
                <Trash2 />
              </Button>
            </div>
            <details className="col-span-2 text-sm sm:col-span-5" open={!!(r.validFrom || r.validTo)}>
              <summary className="cursor-pointer text-muted-foreground">Vigencia {r.validFrom || r.validTo ? `(${r.validFrom || "…"} a ${r.validTo || "…"})` : "(siempre)"}</summary>
              <div className="mt-2 flex flex-wrap gap-3">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`vf-${r.key}`}>Desde el</Label>
                  <Input id={`vf-${r.key}`} type="date" value={r.validFrom} onChange={(e) => update(r.key, { validFrom: e.target.value })} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`vt-${r.key}`}>Hasta el</Label>
                  <Input id={`vt-${r.key}`} type="date" value={r.validTo} onChange={(e) => update(r.key, { validTo: e.target.value })} />
                </div>
              </div>
            </details>
          </div>
        ))}
      </fieldset>

      {error ? <p role="alert" className="rounded-md bg-alerta-claro px-3 py-2 text-sm text-destructive">{error}</p> : null}

      {!readOnly ? (
        <div className="flex flex-wrap gap-3 border-t pt-5">
          <Button type="button" variant="outline" onClick={() => add()} disabled={locations.length === 0}>
            <Plus /> Agregar franja
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await save(rows.map((r) => ({ locationId: r.locationId, weekday: r.weekday, startTime: r.startTime, endTime: r.endTime, validFrom: r.validFrom, validTo: r.validTo })));
                if (res.ok) {
                  toast.success(res.message ?? "Horario guardado.");
                  router.refresh();
                } else setError(res.message ?? "No se pudo guardar.");
              })
            }
          >
            {pending ? "Guardando…" : "Guardar horario"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
