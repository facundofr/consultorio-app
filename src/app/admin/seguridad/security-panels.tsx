"use client";

import { Check, Copy, ShieldCheck, ShieldOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  changePasswordAction,
  confirmTwoFactorSetupAction,
  disableTwoFactorAction,
  regenerateBackupCodesAction,
  startTwoFactorSetupAction,
} from "../_actions/account";
import type { ActionState } from "../_lib/action";

function Alert({ children, tone = "error" }: { children: React.ReactNode; tone?: "error" | "ok" }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={tone === "error" ? "rounded-lg bg-alerta-claro px-3 py-2.5 text-sm text-destructive" : "rounded-lg bg-secondary px-3 py-2.5 text-sm"}>
      {children}
    </p>
  );
}

function CodeInput({ id, value, onChange, label = "Código de 6 números de la app" }: { id: string; value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        placeholder="123456"
        className="max-w-40 text-lg tracking-widest tabular-nums"
      />
    </div>
  );
}

function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-3 rounded-lg border-2 border-sol bg-sol-claro p-4 text-tinta">
      <p className="font-bold">Guardá estos códigos de respaldo</p>
      <p className="text-sm">
        Sirven para entrar si perdés el celular. Cada uno se usa <strong>una sola vez</strong>. No los vas a volver a ver: copialos en un lugar seguro (un gestor de contraseñas o un papel guardado).
      </p>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-base tabular-nums sm:grid-cols-3">
        {codes.map((c) => <li key={c}>{c}</li>)}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(codes.join("\n"));
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? <Check /> : <Copy />} {copied ? "¡Copiados!" : "Copiar códigos"}
        </Button>
        <Button type="button" onClick={onDone}>Ya los guardé</Button>
      </div>
    </div>
  );
}

export function TwoFactorPanel({ enabled, required, backupCodesLeft }: { enabled: boolean; required: boolean; backupCodesLeft: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [mode, setMode] = useState<"idle" | "regen" | "disable">("idle");

  const done = () => {
    setCodes(null);
    setSetup(null);
    setMode("idle");
    setCode("");
    router.refresh();
  };

  if (codes) return <BackupCodes codes={codes} onDone={done} />;

  if (!enabled) {
    if (!setup) {
      return (
        <div className="flex flex-col gap-3">
          {error ? <Alert>{error}</Alert> : null}
          <p className="flex items-center gap-2 text-sm"><ShieldOff className="size-4" aria-hidden /> Desactivado.</p>
          <Button
            type="button"
            className="self-start"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const r = await startTwoFactorSetupAction();
                if (r.ok) setSetup({ secret: r.secret, qr: r.qr });
                else setError(r.error);
              })
            }
          >
            <ShieldCheck /> Activar doble factor
          </Button>
        </div>
      );
    }
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            setError(null);
            const r = await confirmTwoFactorSetupAction(code);
            if (r.ok) setCodes(r.codes);
            else setError(r.error);
          });
        }}
      >
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
          <li>Abrí la app de autenticación y elegí «Agregar cuenta» o «Escanear código QR».</li>
          <li>Escaneá este código (o escribí la clave a mano).</li>
          <li>Ingresá el código de 6 números que te muestra la app.</li>
        </ol>
        <div className="flex flex-wrap items-center gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- data: URL generated on the server */}
          <img src={setup.qr} alt="Código QR para la app de autenticación" width={200} height={200} className="rounded-lg border bg-white p-2" />
          <div className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Clave para escribir a mano</span>
            <code className="break-all font-mono text-base tracking-wider">{setup.secret.match(/.{1,4}/g)?.join(" ")}</code>
          </div>
        </div>
        {error ? <Alert>{error}</Alert> : null}
        <CodeInput id="setup-code" value={code} onChange={setCode} />
        <div className="flex gap-2">
          <Button type="submit" disabled={pending || code.replace(/\s/g, "").length !== 6}>Confirmar y activar</Button>
          <Button type="button" variant="ghost" onClick={() => { setSetup(null); setError(null); setCode(""); }}>Cancelar</Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-primary"><ShieldCheck className="size-4" aria-hidden /> Activado.</p>
      <p className="text-sm text-muted-foreground">
        Te quedan <strong className="text-foreground">{backupCodesLeft}</strong> códigos de respaldo sin usar.
        {backupCodesLeft <= 3 ? " Conviene generar nuevos." : ""}
      </p>
      {error ? <Alert>{error}</Alert> : null}
      {mode === "idle" ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => { setMode("regen"); setError(null); }}>Generar nuevos códigos de respaldo</Button>
          {!required ? <Button type="button" variant="outline" onClick={() => { setMode("disable"); setError(null); }}>Desactivar</Button> : null}
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              setError(null);
              if (mode === "regen") {
                const r = await regenerateBackupCodesAction(code);
                if (r.ok) setCodes(r.codes);
                else setError(r.error);
              } else {
                const r = await disableTwoFactorAction(code);
                if (r.ok) done();
                else setError(r.error);
              }
            });
          }}
        >
          <p className="text-sm">{mode === "regen" ? "Los códigos anteriores dejan de funcionar." : "Vas a ingresar solo con la contraseña."} Para confirmar, ingresá un código de la app.</p>
          <CodeInput id="confirm-code" value={code} onChange={setCode} />
          <div className="flex gap-2">
            <Button type="submit" variant={mode === "disable" ? "destructive" : "default"} disabled={pending || code.replace(/\s/g, "").length !== 6}>
              {mode === "regen" ? "Generar" : "Desactivar doble factor"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => { setMode("idle"); setCode(""); setError(null); }}>Cancelar</Button>
          </div>
        </form>
      )}
    </div>
  );
}

export function PasswordForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(changePasswordAction, {});
  return (
    <form action={action} key={state.ok ? state.seq : "form"} className="flex flex-col gap-4">
      {state.message ? <Alert tone={state.ok ? "ok" : "error"}>{state.message}</Alert> : null}
      {[
        { name: "current", label: "Contraseña actual", auto: "current-password" },
        { name: "next", label: "Contraseña nueva (mínimo 10 caracteres)", auto: "new-password" },
        { name: "confirm", label: "Repetí la contraseña nueva", auto: "new-password" },
      ].map((f) => (
        <div key={f.name} className="flex flex-col gap-1.5">
          <Label htmlFor={`pw-${f.name}`}>{f.label}</Label>
          <Input id={`pw-${f.name}`} name={f.name} type="password" autoComplete={f.auto} required aria-invalid={!!state.fieldErrors?.[f.name]} />
          {state.fieldErrors?.[f.name] ? <p className="text-sm text-destructive">{state.fieldErrors[f.name]}</p> : null}
        </div>
      ))}
      <Button type="submit" className="self-start" disabled={pending}>Cambiar contraseña</Button>
    </form>
  );
}
