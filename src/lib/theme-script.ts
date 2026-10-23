/** localStorage key for the theme choice: "light" | "dark" | "system". */
export const THEME_KEY = "turnos-theme";

/**
 * Runs in <head> before the first paint, so the page never flashes the wrong
 * theme. Kept tiny and dependency-free on purpose.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light"}catch(e){}})()`;
