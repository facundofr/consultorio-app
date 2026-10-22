import * as React from "react";
import { cn } from "@/lib/utils";

const fieldBase =
  "w-full min-w-0 rounded-md border border-input bg-card px-3 text-base shadow-xs outline-none transition-colors placeholder:text-muted-foreground/80 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn(fieldBase, "h-10 py-2", className)} {...props} />;
}

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(fieldBase, "min-h-24 py-2", className)} {...props} />;
}

/** Native select: accessible, works without JS and with plain form posts. */
function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select data-slot="select" className={cn(fieldBase, "h-10 py-2 pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export { Input, NativeSelect, Textarea, fieldBase };
