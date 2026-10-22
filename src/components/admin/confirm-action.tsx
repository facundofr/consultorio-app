"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type Result = { ok?: boolean; message?: string };

/** Confirmation dialog for destructive actions (soft deletes, cancellations). */
export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel,
  action,
  redirectTo,
  children,
}: {
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  action: (fd: FormData) => Promise<Result>;
  redirectTo?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <AlertDialog open={open} onOpenChange={(o) => { setOpen(o); setError(null); }}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <form
          className="flex flex-col gap-4"
          action={(fd) =>
            start(async () => {
              const res = await action(fd);
              if (res.ok) {
                toast.success(res.message ?? "Listo.");
                setOpen(false);
                if (redirectTo) router.push(redirectTo);
                else router.refresh();
              } else setError(res.message ?? "No se pudo completar la acción.");
            })
          }
        >
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
          {children}
          {error ? (
            <p role="alert" className="rounded-md bg-alerta-claro px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Volver</AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Procesando…" : confirmLabel}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
