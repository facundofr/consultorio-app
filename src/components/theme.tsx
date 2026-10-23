"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect } from "react";
import { THEME_KEY } from "@/lib/theme-script";
import { cn } from "@/lib/utils";

function setTheme(dark: boolean) {
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  try {
    localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
  } catch {}
}

/**
 * One tap switches theme: in light mode it shows a moon (go dark), in dark
 * mode a sun (go light). Icons and labels swap with the `dark:` variant, so
 * the right one shows from the first paint. Until the person picks, the
 * theme follows the operating system.
 */
export function ThemeToggle({ compact = false, className }: { compact?: boolean; className?: string }) {
  // Keep following the OS while nothing was chosen; sync other tabs.
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const stored = () => {
      try {
        return localStorage.getItem(THEME_KEY);
      } catch {
        return null;
      }
    };
    const onOs = () => {
      const s = stored();
      if (s !== "light" && s !== "dark") document.documentElement.classList.toggle("dark", mq.matches);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY && (e.newValue === "light" || e.newValue === "dark")) {
        document.documentElement.classList.toggle("dark", e.newValue === "dark");
      }
    };
    mq.addEventListener("change", onOs);
    window.addEventListener("storage", onStorage);
    return () => {
      mq.removeEventListener("change", onOs);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return (
    <button
      type="button"
      onClick={() => setTheme(!document.documentElement.classList.contains("dark"))}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:text-foreground",
        compact ? "size-9 justify-center" : "h-9 px-3",
        className,
      )}
    >
      <span className="relative size-5" aria-hidden>
        <Moon className="absolute inset-0 size-5 transition-all duration-300 dark:rotate-90 dark:scale-0 dark:opacity-0" />
        <Sun className="absolute inset-0 size-5 rotate-90 scale-0 opacity-0 transition-all duration-300 dark:rotate-0 dark:scale-100 dark:opacity-100" />
      </span>
      {/* Hidden spans drop out of the accessible name: only the current action is announced. */}
      <span className={cn("dark:hidden", compact && "sr-only")}>Modo oscuro</span>
      <span className={cn("hidden dark:inline", compact && "dark:sr-only")}>Modo claro</span>
    </button>
  );
}
