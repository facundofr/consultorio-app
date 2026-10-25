"use client";

import { RotateCw } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { retryEmailAction } from "../../../_actions/emails";

export function RetryEmailButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await retryEmailAction(id);
          if (r.ok) toast.success(r.message);
          else toast.error(r.message ?? "No se pudo reintentar.");
        })
      }
    >
      <RotateCw /> Reintentar envío
    </Button>
  );
}
