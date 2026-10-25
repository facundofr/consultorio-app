import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { THEME_SCRIPT } from "@/lib/theme-script";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Turnos IA", template: "%s · Turnos IA" },
  description: "Reservá tu turno médico online, conversando con nuestro asistente o con el formulario.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the mobile tab bar sit above the iPhone home indicator (safe-area insets).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#141c1f" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Per-request CSP nonce set by src/proxy.ts. Reading headers makes every
  // page render on request, which nonces require (see DECISIONS.md, S4).
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    // The theme script sets class="dark" before React hydrates.
    <html lang="es-AR" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
