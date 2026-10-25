"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyTwoFactorAction, type VerifyState } from "../../_actions/session";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending ? "Verificando…" : "Verificar"}
    </Button>
  );
}

export function VerifyForm({ next }: { next?: string }) {
  const [state, action] = useActionState<VerifyState, FormData>(verifyTwoFactorAction, {});
  const [backup, setBackup] = useState(false);
  return (
    <form action={action} className="flex flex-col gap-4">
      {state.error ? (
        <p role="alert" className="rounded-lg bg-alerta-claro px-3 py-2.5 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <input type="hidden" name="next" value={next ?? ""} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code">{backup ? "Código de respaldo" : "Código de 6 números"}</Label>
        <Input
          key={backup ? "backup" : "totp"}
          id="code"
          name="code"
          required
          autoFocus
          autoComplete="one-time-code"
          inputMode={backup ? "text" : "numeric"}
          pattern={backup ? undefined : "[0-9 ]{6,7}"}
          maxLength={backup ? 12 : 7}
          placeholder={backup ? "XXXX-XXXX" : "123456"}
          className="text-lg tracking-widest tabular-nums"
        />
      </div>
      <Submit />
      <button type="button" onClick={() => setBackup((b) => !b)} className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
        {backup ? "Usar el código de la app" : "No tengo el celular: usar un código de respaldo"}
      </button>
    </form>
  );
}
