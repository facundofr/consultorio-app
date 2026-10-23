"use client";

import { AlertDialog as P } from "radix-ui";
import * as React from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const AlertDialog = P.Root;
const AlertDialogTrigger = P.Trigger;

function AlertDialogContent({ className, ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <P.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-xl border bg-card p-5 shadow-lg data-[state=open]:animate-in data-[state=open]:zoom-in-95",
          className,
        )}
        {...props}
      />
    </P.Portal>
  );
}
function AlertDialogTitle({ className, ...props }: React.ComponentProps<typeof P.Title>) {
  return <P.Title className={cn("text-lg font-semibold", className)} {...props} />;
}
function AlertDialogDescription({ className, ...props }: React.ComponentProps<typeof P.Description>) {
  return <P.Description className={cn("text-sm text-muted-foreground", className)} {...props} />;
}
function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />;
}
function AlertDialogCancel({ className, ...props }: React.ComponentProps<typeof P.Cancel>) {
  return <P.Cancel className={cn(buttonVariants({ variant: "outline" }), className)} {...props} />;
}
function AlertDialogAction({ className, ...props }: React.ComponentProps<typeof P.Action>) {
  return <P.Action className={cn(buttonVariants({ variant: "destructive" }), className)} {...props} />;
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
};
