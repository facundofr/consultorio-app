"use client";

import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

function DialogContent({
  className,
  children,
  side,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & { side?: "center" | "left" | "bottom" }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col gap-4 overflow-y-auto border bg-card p-5 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out",
          side === "left"
            ? "inset-y-0 left-0 h-full w-72 max-w-[85vw] data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left"
            : side === "bottom"
              ? "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl pb-[calc(1.25rem+env(safe-area-inset-bottom))] data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom"
              : "left-1/2 top-1/2 max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
          <XIcon className="size-4" />
          <span className="sr-only">Cerrar</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 pr-8", className)} {...props} />;
}
function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />;
}
function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-lg font-semibold", className)} {...props} />;
}
function DialogDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger };
