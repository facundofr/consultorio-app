"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="top-center"
      closeButton
      toastOptions={{
        classNames: {
          toast: "!bg-card !text-foreground !border-border !font-sans",
          description: "!text-muted-foreground",
        },
      }}
    />
  );
}
