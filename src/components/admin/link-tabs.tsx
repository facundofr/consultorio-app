import Link from "next/link";
import { cn } from "@/lib/utils";

/** URL-driven tabs (work without JavaScript, survive reloads). */
export function LinkTabs({ tabs, active }: { tabs: { key: string; label: string; href: string }[]; active: string }) {
  return (
    <nav aria-label="Secciones" className="mb-6 flex gap-1 overflow-x-auto border-b">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={cn(
            "-mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground",
            t.key === active && "border-primary text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
