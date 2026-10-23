"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { DayButton, DayPicker, getDefaultClassNames } from "react-day-picker";
import { es } from "react-day-picker/locale";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui Calendar (react-day-picker v9), in Spanish (es-AR, Monday first)
 * and themed with the app tokens. `size="lg"` gives big cells for month views.
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  size = "default",
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & { size?: "default" | "lg" }) {
  const d = getDefaultClassNames();
  const lg = size === "lg";
  return (
    <DayPicker
      locale={es}
      weekStartsOn={1}
      showOutsideDays={showOutsideDays}
      className={cn("bg-card p-3 [--cell:2.25rem]", lg && "w-full p-0 [--cell:auto]", className)}
      classNames={{
        root: cn("w-fit", lg && "w-full", d.root),
        months: cn("relative flex flex-col gap-4", d.months),
        month: cn("flex w-full flex-col gap-3", d.month),
        nav: cn("absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1", d.nav),
        button_previous: cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "aria-disabled:opacity-40", d.button_previous),
        button_next: cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "aria-disabled:opacity-40", d.button_next),
        month_caption: cn("flex h-8 items-center justify-center px-8", d.month_caption),
        caption_label: cn("select-none font-semibold first-letter:uppercase", lg && "text-lg", d.caption_label),
        month_grid: cn("w-full border-collapse", lg && "table-fixed", d.month_grid),
        weekdays: cn("flex", lg && "table-row", d.weekdays),
        weekday: cn(
          "flex-1 select-none pb-1 text-[0.8rem] font-semibold text-muted-foreground first-letter:uppercase",
          lg ? "table-cell py-2 text-left pl-2" : "w-(--cell)",
          d.weekday,
        ),
        week: cn("mt-1 flex w-full", lg && "mt-0 table-row", d.week),
        day: cn(
          "group/day relative p-0 text-center select-none",
          lg ? "table-cell h-24 border align-top sm:h-28" : "aspect-square w-(--cell)",
          d.day,
        ),
        today: cn(!lg && "[&>button]:font-bold [&>button]:ring-2 [&>button]:ring-sol", d.today),
        outside: cn("text-muted-foreground/60", d.outside),
        disabled: cn("text-muted-foreground/40", d.disabled),
        hidden: cn("invisible", d.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: c, ...rest }) =>
          orientation === "left" ? <ChevronLeft className={cn("size-4", c)} {...rest} /> : <ChevronRight className={cn("size-4", c)} {...rest} />,
        DayButton: CalendarDayButton,
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({ className, day, modifiers, ...props }: React.ComponentProps<typeof DayButton>) {
  const ref = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);
  return (
    <button
      ref={ref}
      type="button"
      data-day={day.date.toLocaleDateString("es-AR")}
      data-selected={modifiers.selected || undefined}
      className={cn(
        "flex size-full items-center justify-center rounded-md text-sm tabular-nums outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
        "data-[selected]:bg-primary data-[selected]:text-primary-foreground data-[selected]:hover:bg-primary",
        className,
      )}
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };
