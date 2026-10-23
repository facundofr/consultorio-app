import type { Metadata, Viewport } from "next";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script sets class="dark" before React hydrates.
    <html lang="es-AR" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
