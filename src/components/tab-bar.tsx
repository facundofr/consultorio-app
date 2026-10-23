"use client";

import {
  CalendarDays,
  CalendarPlus,
  House,
  Menu,
  MessageCircle,
  ShieldCheck,
  Ticket,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Icons by name: server layouts can only pass serializable props. */
const ICONS = {
  house: House,
  calendar: CalendarDays,
  calendarPlus: CalendarPlus,
  users: Users,
  chat: MessageCircle,
  ticket: Ticket,
  shield: ShieldCheck,
  menu: Menu,
} satisfies Record<string, LucideIcon>;
export type TabIcon = keyof typeof ICONS;

export type Tab = {
  href: string;
  label: string;
  icon: TabIcon;
  /** Small red counter, like a notification badge. */
  badge?: number;
  badgeLabel?: string;
  /** Active when the path starts with this (defaults to an exact match on href). */
  match?: string;
};

/** Height of the bar; pages add it as bottom padding so nothing hides behind it. */
export const TAB_BAR_PADDING = "pb-[calc(4.5rem+env(safe-area-inset-bottom))]";

/**
 * Mobile bottom navigation: two tabs, a raised main action, two tabs.
 * The last slot is usually "Más", which opens a sheet (passed as `onMore`).
 */
export function TabBar({
  left,
  center,
  right,
  onMore,
  moreOpen,
  hideFrom = "lg",
}: {
  left: [Tab, Tab];
  center: Tab;
  right: [Tab] | [Tab, Tab];
  onMore?: () => void;
  moreOpen?: boolean;
  hideFrom?: "md" | "lg";
}) {
  const pathname = usePathname();
  const isActive = (t: Tab) => (t.match ? pathname.startsWith(t.match) : pathname === t.href.split("?")[0]);

  const item = (t: Tab) => {
    const Icon = ICONS[t.icon];
    const active = isActive(t);
    return (
      <li key={t.href} className="flex flex-1">
        <Link
          href={t.href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "relative flex min-h-14 flex-1 flex-col items-center justify-end gap-0.5 px-1 pb-1.5 text-[0.72rem] font-semibold text-muted-foreground",
            active && "text-primary",
          )}
        >
          <span className="relative">
            <Icon className="size-6" strokeWidth={active ? 2.4 : 1.8} aria-hidden />
            {t.badge ? (
              <span className="absolute -right-3 -top-1.5 min-w-5 rounded-full bg-destructive px-1 text-center text-[0.68rem] font-bold leading-5 text-destructive-foreground" aria-hidden>
                {t.badge > 99 ? "99+" : t.badge}
              </span>
            ) : null}
          </span>
          {t.label}
          {t.badge ? <span className="sr-only">, {t.badgeLabel ?? t.badge}</span> : null}
        </Link>
      </li>
    );
  };

  const CenterIcon = ICONS[center.icon];
  return (
    <nav
      aria-label="Navegación principal"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgb(var(--shadow-color)/0.1)] backdrop-blur",
        hideFrom === "md" ? "md:hidden" : "lg:hidden",
      )}
    >
      <ul className="mx-auto flex max-w-xl items-stretch">
        {left.map(item)}
        <li className="flex flex-1 justify-center">
          <Link
            href={center.href}
            aria-current={isActive(center) ? "page" : undefined}
            className="flex flex-col items-center justify-end gap-0.5 pb-1.5 text-[0.72rem] font-semibold text-primary"
          >
            <span className="-mt-5 flex size-14 items-center justify-center rounded-full border-4 border-card bg-primary text-primary-foreground shadow-md">
              <CenterIcon className="size-6" aria-hidden />
            </span>
            {center.label}
          </Link>
        </li>
        {right.map(item)}
        {onMore ? (
          <li className="flex flex-1">
            <button
              type="button"
              onClick={onMore}
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
              className={cn(
                "flex min-h-14 flex-1 flex-col items-center justify-end gap-0.5 px-1 pb-1.5 text-[0.72rem] font-semibold text-muted-foreground",
                moreOpen && "text-primary",
              )}
            >
              <Menu className="size-6" strokeWidth={1.8} aria-hidden />
              Más
            </button>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
