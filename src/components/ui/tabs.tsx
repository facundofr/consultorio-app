"use client";

import { Tabs as P } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

const Tabs = P.Root;
function TabsList({ className, ...props }: React.ComponentProps<typeof P.List>) {
  return <P.List className={cn("inline-flex h-10 items-center gap-1 rounded-lg bg-muted p-1", className)} {...props} />;
}
function TabsTrigger({ className, ...props }: React.ComponentProps<typeof P.Trigger>) {
  return (
    <P.Trigger
      className={cn(
        "inline-flex h-8 items-center rounded-md px-3 text-sm font-semibold text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs",
        className,
      )}
      {...props}
    />
  );
}
function TabsContent({ className, ...props }: React.ComponentProps<typeof P.Content>) {
  return <P.Content className={cn("mt-4", className)} {...props} />;
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
